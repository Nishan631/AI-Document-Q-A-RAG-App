import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { extractTextPerPage } from '../utils/pdfExtractor.js';
import { createChunksFromPages } from '../utils/chunker.js';
import { getBatchEmbeddings } from './embeddingService.js';

/**
 * Asynchronously processes and vectorizes an uploaded PDF document.
 */
export const processDocumentIngestion = async (documentId) => {
  console.log(`[Ingestion] Starting ingestion for document: ${documentId}`);

  const doc = await Document.findById(documentId);
  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  try {
    doc.status = 'processing';
    await doc.save();

    // 1. Extract text page-by-page if not already extracted
    let pages = doc.extractedPages;
    if (!pages || pages.length === 0) {
      console.log(`[Ingestion] Extracting pages from PDF file: ${doc.filePath}`);
      const extraction = await extractTextPerPage(doc.filePath);

      if (extraction.isScannedOrEmpty) {
        doc.status = 'failed';
        doc.errorMessage = 'No selectable text found. This document may be scanned or empty.';
        doc.pageCount = extraction.pageCount;
        await doc.save();
        return { success: false, error: doc.errorMessage };
      }

      doc.pageCount = extraction.pageCount;
      doc.extractedPages = extraction.pages;
      pages = extraction.pages;
      await doc.save();
    }

    // 2. Chunk text with sliding window & sentence preservation
    console.log(`[Ingestion] Chunking ${pages.length} pages...`);
    const rawChunks = createChunksFromPages(pages, {
      chunkSizeWords: 500,
      overlapWords: 80,
    });

    if (rawChunks.length === 0) {
      doc.status = 'failed';
      doc.errorMessage = 'Document text was empty after chunking.';
      await doc.save();
      return { success: false, error: doc.errorMessage };
    }

    console.log(`[Ingestion] Generated ${rawChunks.length} chunks. Generating embeddings...`);

    // 3. Generate 768-dimensional embeddings for all chunks in batch
    const texts = rawChunks.map((c) => c.text);
    const embeddings = await getBatchEmbeddings(texts, (progress) => {
      console.log(`[Ingestion] Embeddings progress: ${progress}%`);
    });

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
    await doc.save();
    return { success: false, error: doc.errorMessage };
  }
};
