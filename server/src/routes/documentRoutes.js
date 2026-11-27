import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { Message } from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';
import { askRateLimiter, uploadRateLimiter } from '../middleware/rateLimiter.js';
import { addIngestionJob } from '../config/queue.js';
import { searchSimilarChunks } from '../services/ragService.js';
import { streamAnswer, generateAnswer } from '../services/llmService.js';
import {
  getCachedQuery,
  setCachedQuery,
  invalidateDocumentCache,
} from '../services/cacheService.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const sanitizedOriginal = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${sanitizedOriginal}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF documents are supported'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
});

// All document routes require authentication
router.use(requireAuth);

// POST /documents - Upload a PDF with rate limiter
router.post('/', uploadRateLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please provide a PDF file' });
    }

    const title = req.body.title?.trim() || req.file.originalname.replace(/\.pdf$/i, '');
    const filePath = req.file.path;
    const fileUrl = `/uploads/${path.basename(filePath)}`;

    const doc = await Document.create({
      userId: req.user._id,
      title,
      fileName: req.file.originalname,
      filePath,
      fileUrl,
      fileSize: req.file.size,
      status: 'processing',
      ingestionProgress: 5,
      ingestionStep: 'Upload received. Ingestion queued...',
    });

    const queueInfo = await addIngestionJob(doc._id);

    return res.status(202).json({
      message: 'PDF uploaded. Ingestion and vectorization in progress.',
      queue: queueInfo,
      document: {
        id: doc._id,
        title: doc.title,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        fileSize: doc.fileSize,
        status: doc.status,
        ingestionProgress: doc.ingestionProgress,
        ingestionStep: doc.ingestionStep,
        createdAt: doc.createdAt,
      },
    });
  } catch (error) {
    console.error('Document upload error:', error);
    return res.status(500).json({ error: error.message || 'Error processing document upload' });
  }
});

// GET /documents - List mine
router.get('/', async (req, res) => {
  try {
    const documents = await Document.find({ userId: req.user._id })
      .select('title fileName fileUrl fileSize pageCount status ingestionProgress ingestionStep errorMessage createdAt')
      .sort({ createdAt: -1 });

    return res.json({ documents });
  } catch (error) {
    console.error('List documents error:', error);
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /documents/:id - Status and metadata
router.get('/:id', async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).select('-extractedPages');

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const chunkCount = await Chunk.countDocuments({ documentId: doc._id });

    return res.json({
      document: {
        ...doc.toObject(),
        chunkCount,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// GET /documents/:id/pages - Inspect extracted text per page
router.get('/:id/pages', async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).select('title pageCount status extractedPages');

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.json({
      id: doc._id,
      title: doc.title,
      pageCount: doc.pageCount,
      status: doc.status,
      pages: doc.extractedPages,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch document pages' });
  }
});

// POST /documents/:id/reindex - Re-trigger ingestion
router.post('/:id/reindex', async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await invalidateDocumentCache(doc._id);

    doc.status = 'processing';
    doc.ingestionProgress = 0;
    doc.ingestionStep = 'Re-indexing initiated...';
    await doc.save();

    await addIngestionJob(doc._id);

    return res.json({ message: 'Re-indexing initiated', status: 'processing' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to trigger re-indexing' });
  }
});

// Minimum similarity threshold (cosine / RRF baseline)
const RELEVANCE_CONFIDENCE_THRESHOLD = 0.50;

// POST /documents/:id/ask - Hybrid Search + Redis Caching + Rate Limiting
router.post('/:id/ask', askRateLimiter, async (req, res) => {
  try {
    const { question, conversationId, searchMode = 'hybrid' } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const doc = await Document.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (doc.status !== 'ready') {
      return res.status(400).json({
        error: `Document is currently ${doc.status}. Please wait until it is ready.`,
      });
    }

    const convId = conversationId || `conv-${doc._id}-${Date.now()}`;
    const cleanQ = question.trim();

    // 1. Check Redis / In-memory Cache for repeated questions
    const cached = await getCachedQuery(doc._id, cleanQ);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    if (cached) {
      // Instant cache hit response!
      res.write(
        `data: ${JSON.stringify({
          type: 'meta',
          conversationId: convId,
          cached: true,
          topScore: cached.topScore,
          isGrounded: cached.isGrounded !== false,
          sources: cached.sources,
        })}\n\n`
      );

      // Stream cached answer tokens rapidly
      const words = (cached.answer || '').split(' ');
      for (const w of words) {
        res.write(`data: ${JSON.stringify({ type: 'token', token: w + ' ' })}\n\n`);
        await new Promise((r) => setTimeout(r, 15));
      }

      await Message.create({
        conversationId: convId,
        documentId: doc._id,
        userId: req.user._id,
        role: 'user',
        content: cleanQ,
      });

      const assistantMsg = await Message.create({
        conversationId: convId,
        documentId: doc._id,
        userId: req.user._id,
        role: 'assistant',
        content: cached.answer,
        sources: cached.sources,
      });

      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          messageId: assistantMsg._id,
          fullAnswer: cached.answer,
          isGrounded: cached.isGrounded !== false,
          cached: true,
        })}\n\n`
      );
      return res.end();
    }

    // 2. Perform Hybrid Search (Vector + Keyword BM25 with Reciprocal Rank Fusion)
    const rawSources = await searchSimilarChunks({
      userId: req.user._id,
      documentId: doc._id,
      query: cleanQ,
      limit: 5,
      mode: searchMode,
    });

    const topScore = rawSources.length > 0 ? (rawSources[0].score || rawSources[0].rrfScore || 0) : 0;
    const isBelowThreshold = topScore < RELEVANCE_CONFIDENCE_THRESHOLD;

    const filteredSources = isBelowThreshold
      ? []
      : rawSources.filter((s) => (s.score || s.rrfScore || 0) >= 0.25);

    // Persist user question
    await Message.create({
      conversationId: convId,
      documentId: doc._id,
      userId: req.user._id,
      role: 'user',
      content: cleanQ,
    });

    // Send metadata
    const mappedSources = filteredSources.map((s, idx) => ({
      sourceIndex: idx + 1,
      chunkId: s.chunkId,
      documentTitle: doc.title,
      pageNumber: s.pageNumber,
      snippet: s.snippet,
      text: s.text,
      score: Number((s.score || s.rrfScore || 0).toFixed(3)),
      retrievalType: s.retrievalType || 'hybrid',
    }));

    res.write(
      `data: ${JSON.stringify({
        type: 'meta',
        conversationId: convId,
        cached: false,
        topScore: Number(topScore.toFixed(3)),
        isGrounded: !isBelowThreshold && mappedSources.length > 0,
        sources: mappedSources,
      })}\n\n`
    );

    // Refusal handling if out of domain
    if (isBelowThreshold || mappedSources.length === 0) {
      const refusalText =
        `I cannot find the answer to this question in the provided document.\n\n` +
        `*(Retrieval Confidence: ${(topScore * 100).toFixed(1)}%, which is below the minimum relevance threshold of ${(RELEVANCE_CONFIDENCE_THRESHOLD * 100)}% for this document).*`;

      const words = refusalText.split(' ');
      for (const w of words) {
        res.write(`data: ${JSON.stringify({ type: 'token', token: w + ' ' })}\n\n`);
        await new Promise((r) => setTimeout(r, 20));
      }

      const assistantMsg = await Message.create({
        conversationId: convId,
        documentId: doc._id,
        userId: req.user._id,
        role: 'assistant',
        content: refusalText,
        sources: [],
      });

      // Cache refusal as well to avoid repeating expensive search
      await setCachedQuery(doc._id, cleanQ, {
        answer: refusalText,
        sources: [],
        topScore,
        isGrounded: false,
      });

      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          messageId: assistantMsg._id,
          fullAnswer: refusalText,
          isGrounded: false,
        })}\n\n`
      );
      return res.end();
    }

    let fullAnswer = '';

    // 3. Stream grounded LLM generation
    await streamAnswer({
      question: cleanQ,
      contextChunks: filteredSources,
      onToken: (token) => {
        fullAnswer += token;
        res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
      },
      onComplete: async (completedText) => {
        try {
          const finalAnswer = completedText || fullAnswer;
          const assistantMsg = await Message.create({
            conversationId: convId,
            documentId: doc._id,
            userId: req.user._id,
            role: 'assistant',
            content: finalAnswer,
            sources: mappedSources,
          });

          // Store in Redis / memory cache (TTL: 24h)
          await setCachedQuery(doc._id, cleanQ, {
            answer: finalAnswer,
            sources: mappedSources,
            topScore,
            isGrounded: true,
          });

          res.write(
            `data: ${JSON.stringify({
              type: 'done',
              messageId: assistantMsg._id,
              fullAnswer: finalAnswer,
              isGrounded: true,
            })}\n\n`
          );
        } catch (dbErr) {
          console.error('Error saving assistant message:', dbErr);
        } finally {
          res.end();
        }
      },
      onError: (err) => {
        console.error('LLM streaming error:', err);
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
      },
    });
  } catch (error) {
    console.error('Ask endpoint error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'Failed to answer question' });
    }
    res.end();
  }
});

// POST /documents/ask-multi - Multi-Document Hybrid Q&A
router.post('/ask-multi', askRateLimiter, async (req, res) => {
  try {
    const { question, documentIds, conversationId } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'At least one documentId is required' });
    }

    // Verify ownership of all target documents
    const validDocs = await Document.find({
      _id: { $in: documentIds },
      userId: req.user._id,
      status: 'ready',
    });

    if (validDocs.length === 0) {
      return res.status(400).json({ error: 'None of the selected documents are ready for Q&A' });
    }

    const targetDocIds = validDocs.map((d) => d._id);
    const cleanQ = question.trim();
    const convId = conversationId || `multi-conv-${Date.now()}`;

    // 1. Check multi-document query cache
    const cached = await getCachedQuery(targetDocIds, cleanQ);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    if (cached) {
      res.write(
        `data: ${JSON.stringify({
          type: 'meta',
          conversationId: convId,
          cached: true,
          sources: cached.sources,
        })}\n\n`
      );

      const words = (cached.answer || '').split(' ');
      for (const w of words) {
        res.write(`data: ${JSON.stringify({ type: 'token', token: w + ' ' })}\n\n`);
        await new Promise((r) => setTimeout(r, 15));
      }

      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          fullAnswer: cached.answer,
          cached: true,
        })}\n\n`
      );
      return res.end();
    }

    // 2. Hybrid search across multiple documents
    const rawSources = await searchSimilarChunks({
      userId: req.user._id,
      documentIds: targetDocIds,
      query: cleanQ,
      limit: 6,
      mode: 'hybrid',
    });

    const mappedSources = rawSources.map((s, idx) => ({
      sourceIndex: idx + 1,
      chunkId: s.chunkId,
      documentId: s.documentId,
      documentTitle: s.documentTitle || 'Document',
      pageNumber: s.pageNumber,
      snippet: s.snippet,
      text: s.text,
      score: Number((s.score || s.rrfScore || 0).toFixed(3)),
      retrievalType: s.retrievalType || 'hybrid',
    }));

    res.write(
      `data: ${JSON.stringify({
        type: 'meta',
        conversationId: convId,
        cached: false,
        sources: mappedSources,
      })}\n\n`
    );

    let fullAnswer = '';

    await streamAnswer({
      question: cleanQ,
      contextChunks: mappedSources,
      onToken: (token) => {
        fullAnswer += token;
        res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
      },
      onComplete: async (completedText) => {
        const finalAnswer = completedText || fullAnswer;
        await setCachedQuery(targetDocIds, cleanQ, {
          answer: finalAnswer,
          sources: mappedSources,
        });

        res.write(
          `data: ${JSON.stringify({
            type: 'done',
            fullAnswer: finalAnswer,
            cached: false,
          })}\n\n`
        );
        res.end();
      },
      onError: (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
      },
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'Multi-document ask error' });
    }
    res.end();
  }
});

// GET /documents/:id/conversations - Chat history
router.get('/:id/conversations', async (req, res) => {
  try {
    const messages = await Message.find({
      documentId: req.params.id,
      userId: req.user._id,
    })
      .sort({ createdAt: 1 })
      .select('conversationId role content sources createdAt');

    return res.json({ messages });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
});

// DELETE /documents/:id - Delete document and all related artifacts
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await invalidateDocumentCache(doc._id);

    if (doc.filePath && fs.existsSync(doc.filePath)) {
      try {
        fs.unlinkSync(doc.filePath);
      } catch (err) {
        console.warn(`Could not delete file ${doc.filePath}:`, err.message);
      }
    }

    await Promise.all([
      Chunk.deleteMany({ documentId: doc._id }),
      Message.deleteMany({ documentId: doc._id }),
      Document.deleteOne({ _id: doc._id }),
    ]);

    return res.json({ message: 'Document and associated data deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
