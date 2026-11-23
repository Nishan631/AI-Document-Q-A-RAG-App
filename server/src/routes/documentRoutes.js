import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { Message } from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';
import { processDocumentIngestion } from '../services/ingestionService.js';
import { searchSimilarChunks } from '../services/ragService.js';
import { streamAnswer, generateAnswer } from '../services/llmService.js';

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

// POST /documents - Upload a PDF, returns immediately with status 'processing'
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please provide a PDF file' });
    }

    const title = req.body.title?.trim() || req.file.originalname.replace(/\.pdf$/i, '');
    const filePath = req.file.path;
    const fileUrl = `/uploads/${path.basename(filePath)}`;

    // Create document record in 'processing' status
    const doc = await Document.create({
      userId: req.user._id,
      title,
      fileName: req.file.originalname,
      filePath,
      fileUrl,
      fileSize: req.file.size,
      status: 'processing',
    });

    // Start background ingestion asynchronously without blocking the response
    setImmediate(() => {
      processDocumentIngestion(doc._id).catch((err) => {
        console.error(`Background ingestion failure for doc ${doc._id}:`, err);
      });
    });

    // Return immediately to client
    return res.status(202).json({
      message: 'PDF uploaded. Ingestion and vectorization in progress.',
      document: {
        id: doc._id,
        title: doc.title,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        fileSize: doc.fileSize,
        status: doc.status,
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
      .select('title fileName fileUrl fileSize pageCount status errorMessage createdAt')
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

    setImmediate(() => {
      processDocumentIngestion(doc._id).catch(console.error);
    });

    return res.json({ message: 'Re-indexing initiated', status: 'processing' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to trigger re-indexing' });
  }
});

// POST /documents/:id/ask - Question in, streamed answer plus sources out (SSE)
router.post('/:id/ask', async (req, res) => {
  try {
    const { question, conversationId } = req.body;
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

    // 1. Retrieve top 5 semantically closest chunks
    const sources = await searchSimilarChunks({
      userId: req.user._id,
      documentId: doc._id,
      query: question.trim(),
      limit: 5,
    });

    // 2. Persist user message in DB
    await Message.create({
      conversationId: convId,
      documentId: doc._id,
      userId: req.user._id,
      role: 'user',
      content: question.trim(),
    });

    // 3. Setup Server-Sent Events headers for live token streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering
    res.flushHeaders();

    // Send metadata event with retrieved sources and conversationId
    res.write(
      `data: ${JSON.stringify({
        type: 'meta',
        conversationId: convId,
        sources: sources.map((s, idx) => ({
          sourceIndex: idx + 1,
          chunkId: s.chunkId,
          pageNumber: s.pageNumber,
          snippet: s.snippet,
          score: s.score,
        })),
      })}\n\n`
    );

    let fullAnswer = '';

    // 4. Stream tokens from LLM
    await streamAnswer({
      question: question.trim(),
      contextChunks: sources,
      onToken: (token) => {
        fullAnswer += token;
        res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
      },
      onComplete: async (completedText) => {
        // Save assistant message with sources to database
        try {
          const assistantMsg = await Message.create({
            conversationId: convId,
            documentId: doc._id,
            userId: req.user._id,
            role: 'assistant',
            content: completedText || fullAnswer,
            sources: sources.map((s) => ({
              chunkId: s.chunkId,
              pageNumber: s.pageNumber,
              snippet: s.snippet,
              score: s.score,
            })),
          });

          res.write(
            `data: ${JSON.stringify({
              type: 'done',
              messageId: assistantMsg._id,
              fullAnswer: completedText || fullAnswer,
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
