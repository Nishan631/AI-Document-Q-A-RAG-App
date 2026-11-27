import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { extractTextPerPage } from '../utils/pdfExtractor.js';
import { createChunksFromPages } from '../utils/chunker.js';
import { getBatchEmbeddings } from './embeddingService.js';

/**
 * Asynchronously processes and vectorizes an uploaded PDF document.
 * Reports live progress (0-100%) and step messages to both caller and MongoDB Document record.
 */
export const processDocumentIngestion = async (documentId, progressCallback) => {
  console.log(`[Ingestion] Starting ingestion for document: ${documentId}`);

  const updateProgress = async (progress, step) => {
    try {
      await Document.findByIdAndUpdate(documentId, {
        ingestionProgress: progress,
        ingestionStep: step,
      });
      if (progressCallback) progressCallback(progress, step);
    } catch (e) {
      // Non-critical progress write failure
    }
  };

  const doc = await Document.findById(documentId);
  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  try {
    doc.status = 'processing';
    await doc.save();
    await updateProgress(10, 'Extracting text page-by-page...');

    // 1. Extract text page-by-page if not already extracted
    let pages = doc.extractedPages;
    if (!pages || pages.length === 0) {
      console.log(`[Ingestion] Extracting pages from PDF file: ${doc.filePath}`);
      const extraction = await extractTextPerPage(doc.filePath);

      if (extraction.isScannedOrEmpty) {
        doc.status = 'failed';
        doc.errorMessage = 'No selectable text found. This document may be scanned or empty.';
        doc.pageCount = extraction.pageCount;
        doc.ingestionStep = 'Failed: Scanned or empty PDF';
        await doc.save();
        return { success: false, error: doc.errorMessage };
      }

      doc.pageCount = extraction.pageCount;
      doc.extractedPages = extraction.pages;
      pages = extraction.pages;
      await doc.save();
    }

    await updateProgress(35, `Extracted ${pages.length} pages. Chunking text...`);

    // 2. Chunk text with sliding window & sentence preservation
    const rawChunks = createChunksFromPages(pages, {
      chunkSizeWords: 500,
      overlapWords: 80,
    });

    if (rawChunks.length === 0) {
      doc.status = 'failed';
      doc.errorMessage = 'Document text was empty after chunking.';
      doc.ingestionStep = 'Failed: Empty text after chunking';
      await doc.save();
      return { success: false, error: doc.errorMessage };
    }

    await updateProgress(50, `Generating embeddings for ${rawChunks.length} chunks...`);

    // 3. Generate 768-dimensional embeddings for all chunks in batch
    const texts = rawChunks.map((c) => c.text);
    const embeddings = await getBatchEmbeddings(texts, async (embedPercent) => {
      // Map 0-100% of embeddings to 50-85% of overall ingestion
      const overall = Math.round(50 + (embedPercent * 0.35));
      await updateProgress(overall, `Embedding vector representations (${embedPercent}%)...`);
    });

    await updateProgress(88, 'Storing vector chunks in MongoDB Atlas...');

    // 4. Clear any old chunks for this document (idempotent)
    await Chunk.deleteMany({ documentId: doc._id });

    // 5. Bulk insert Chunk records into MongoDB Atlas
    const chunkDocs = rawChunks.map((chunk, idx) => ({
      documentId: doc._id,
      userId: doc.userId,
      pageNumber: chunk.pageNumber,
      text: chunk.text,
      embedding: embeddings[idx],
      chunkIndex: chunk.chunkIndex,
    }));

    await Chunk.insertMany(chunkDocs);

    // 6. Update document status to ready
    doc.status = 'ready';
    doc.errorMessage = null;
    doc.ingestionProgress = 100;
    doc.ingestionStep = 'Ready for questions with verified citations.';
    await doc.save();

    console.log(
      `[Ingestion] Successfully indexed document "${doc.title}" with ${chunkDocs.length} vector chunks.`
    );

    return {
      success: true,
      documentId: doc._id,
      chunkCount: chunkDocs.length,
    };
  } catch (error) {
    console.error(`[Ingestion Failed] Error indexing document ${documentId}:`, error);
    doc.status = 'failed';
    doc.errorMessage = error.message || 'Error occurred during ingestion and vectorization';
    doc.ingestionStep = 'Ingestion failed';
    await doc.save();
    return { success: false, error: doc.errorMessage };
  }
};
