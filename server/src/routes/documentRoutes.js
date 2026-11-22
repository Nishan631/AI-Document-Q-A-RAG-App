import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { Message } from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';
import { extractTextPerPage } from '../utils/pdfExtractor.js';

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

// POST /documents - Upload a PDF, extract text per page, and save
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please provide a PDF file' });
    }

    const title = req.body.title?.trim() || req.file.originalname.replace(/\.pdf$/i, '');
    const filePath = req.file.path;
    const fileUrl = `/uploads/${path.basename(filePath)}`;

    // Create document record initially in 'processing' status
    const doc = await Document.create({
      userId: req.user._id,
      title,
      fileName: req.file.originalname,
      filePath,
      fileUrl,
      fileSize: req.file.size,
      status: 'processing',
    });

    try {
      // Extract text page-by-page
      const extraction = await extractTextPerPage(filePath);

      if (extraction.isScannedOrEmpty) {
        doc.status = 'failed';
        doc.errorMessage = 'No selectable text found in PDF. This document may be scanned or empty.';
        doc.pageCount = extraction.pageCount;
        await doc.save();

        return res.status(400).json({
          error: doc.errorMessage,
          document: doc,
        });
      }

      doc.pageCount = extraction.pageCount;
      doc.extractedPages = extraction.pages;
      doc.status = 'ready';
      await doc.save();

      return res.status(201).json({
        message: 'PDF uploaded and parsed successfully',
        document: {
          id: doc._id,
          title: doc.title,
          fileName: doc.fileName,
          fileUrl: doc.fileUrl,
          fileSize: doc.fileSize,
          pageCount: doc.pageCount,
          status: doc.status,
          createdAt: doc.createdAt,
          pagesExtracted: doc.extractedPages.length,
        },
      });
    } catch (extractError) {
      console.error('PDF extraction failed:', extractError);
      doc.status = 'failed';
      doc.errorMessage = `Failed to extract text from PDF: ${extractError.message}`;
      await doc.save();

      return res.status(500).json({
        error: doc.errorMessage,
        document: doc,
      });
    }
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

    return res.json({ document: doc });
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

    // Remove file from disk if it exists
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      try {
        fs.unlinkSync(doc.filePath);
      } catch (err) {
        console.warn(`Could not delete file ${doc.filePath}:`, err.message);
      }
    }

    // Delete chunks, messages, and document record
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
