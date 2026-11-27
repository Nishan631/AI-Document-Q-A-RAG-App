import mongoose from 'mongoose';
import { Chunk } from '../models/Chunk.js';
import { Document } from '../models/Document.js';
import { getEmbedding } from './embeddingService.js';

/**
 * Calculates cosine similarity between two numeric vectors.
 */
export const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
};

/**
 * Reciprocal Rank Fusion (RRF) algorithm to combine Vector & Keyword rankings.
 * RRF Score = sum( weight / (k + rank) )
 */
export const reciprocalRankFusion = (vectorResults, keywordResults, k = 60) => {
  const scores = new Map();
  const chunkData = new Map();

  // 1. Process Vector ranks (Weight: 1.0)
  vectorResults.forEach((item, rank) => {
    const id = item.chunkId.toString();
    chunkData.set(id, { ...item, retrievalType: 'vector' });
    const currentScore = scores.get(id) || 0;
    scores.set(id, currentScore + 1.0 / (k + (rank + 1)));
  });

  // 2. Process Keyword ranks (Weight: 0.8)
  keywordResults.forEach((item, rank) => {
    const id = item.chunkId.toString();
    const existing = chunkData.get(id);
    if (existing) {
      existing.retrievalType = 'hybrid'; // Found in both!
    } else {
      chunkData.set(id, { ...item, retrievalType: 'keyword' });
    }
    const currentScore = scores.get(id) || 0;
    scores.set(id, currentScore + 0.8 / (k + (rank + 1)));
  });

  // 3. Sort chunks by fused score descending
  const sorted = Array.from(scores.entries())
    .map(([id, rrfScore]) => {
      const data = chunkData.get(id);
      return {
        ...data,
        rrfScore: Number(rrfScore.toFixed(4)),
      };
    })
    .sort((a, b) => b.rrfScore - a.rrfScore);

  return sorted;
};

/**
 * Searches chunks using Keyword / BM25 matching.
 */
export const searchKeywordChunks = async ({ userId, docFilter, query, limit = 10 }) => {
  // Clean query into search keywords
  const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'of', 'for', 'to']);
  const terms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (terms.length === 0) return [];

  const regexTerms = terms.map((t) => new RegExp(t, 'i'));

  // Match chunks containing these terms
  const filter = {
    userId: new mongoose.Types.ObjectId(userId),
    ...docFilter,
    $or: regexTerms.map((r) => ({ text: r })),
  };

  const chunks = await Chunk.find(filter)
    .select('_id documentId pageNumber text chunkIndex')
    .limit(limit * 2);

  // Score chunks by term frequency
  const scored = chunks.map((c) => {
    const textLower = c.text.toLowerCase();
    let termMatches = 0;
    for (const t of terms) {
      if (textLower.includes(t)) termMatches++;
    }
    const score = termMatches / terms.length;
    return {
      chunkId: c._id,
      documentId: c.documentId,
      pageNumber: c.pageNumber,
      text: c.text,
      snippet: c.text.slice(0, 180) + '...',
      score: Number(score.toFixed(3)),
      chunkIndex: c.chunkIndex,
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
};

/**
 * Hybrid Search Engine: Combines Dense Vector Search + Keyword Search via RRF.
 * Supports single document or multiple documents.
 */
export const searchSimilarChunks = async ({
  userId,
  documentId,
  documentIds = null,
  query,
  limit = 5,
  mode = 'hybrid', // 'hybrid' | 'vector' | 'keyword'
}) => {
  const uId = new mongoose.Types.ObjectId(userId);

  // Configure single or multi-document filter
  let docFilter = {};
  if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
    const objectIds = documentIds.map((id) => new mongoose.Types.ObjectId(id));
    docFilter = { documentId: { $in: objectIds } };
  } else if (documentId) {
    docFilter = { documentId: new mongoose.Types.ObjectId(documentId) };
  }

  // Retrieve document metadata to populate titles for multi-doc
  const docMeta = new Map();
  try {
    const docs = await Document.find({
      userId: uId,
      ...(docFilter.documentId ? { _id: docFilter.documentId } : {}),
    }).select('_id title fileName');
    docs.forEach((d) => docMeta.set(d._id.toString(), d.title || d.fileName));
  } catch (e) {
    // Non-fatal
  }

  // --- BRANCH 1: Dense Vector Search ---
  let vectorResults = [];
  if (mode === 'vector' || mode === 'hybrid') {
    const queryVector = await getEmbedding(query);

    // Try MongoDB Atlas native $vectorSearch aggregation
    try {
      const pipeline = [
        {
          $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector: queryVector,
            numCandidates: 60,
            limit: limit * 2,
            filter: {
              userId: { $eq: uId },
              ...(documentId
                ? { documentId: { $eq: new mongoose.Types.ObjectId(documentId) } }
                : {}),
            },
          },
        },
        {
          $project: {
            _id: 1,
            documentId: 1,
            pageNumber: 1,
            text: 1,
            chunkIndex: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ];

      const results = await Chunk.aggregate(pipeline);

      if (results && results.length > 0) {
        vectorResults = results.map((r) => ({
          chunkId: r._id,
          documentId: r.documentId,
          documentTitle: docMeta.get(r.documentId?.toString()) || 'Document',
          pageNumber: r.pageNumber,
          text: r.text,
          snippet: r.text.slice(0, 180) + '...',
          score: Number((r.score || 0).toFixed(3)),
          chunkIndex: r.chunkIndex,
        }));
      }
    } catch (atlasSearchErr) {
      // Graceful fallback to exact cosine similarity
    }

    // Fallback if Atlas index is not yet built
    if (vectorResults.length === 0) {
      const chunks = await Chunk.find({
        userId: uId,
        ...docFilter,
      }).select('_id documentId pageNumber text embedding chunkIndex');

      vectorResults = chunks
        .map((chunk) => {
          const score = cosineSimilarity(queryVector, chunk.embedding);
          return {
            chunkId: chunk._id,
            documentId: chunk.documentId,
            documentTitle: docMeta.get(chunk.documentId?.toString()) || 'Document',
            pageNumber: chunk.pageNumber,
            text: chunk.text,
            snippet: chunk.text.slice(0, 180) + '...',
            score: Number(score.toFixed(3)),
            chunkIndex: chunk.chunkIndex,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit * 2);
    }
  }

  // --- Return early if mode is vector only ---
  if (mode === 'vector') {
    return vectorResults.slice(0, limit);
  }

  // --- BRANCH 2: Lexical / Keyword Search ---
  let keywordResults = [];
  if (mode === 'keyword' || mode === 'hybrid') {
    const rawKw = await searchKeywordChunks({
      userId: uId,
      docFilter,
      query,
      limit: limit * 2,
    });
    keywordResults = rawKw.map((r) => ({
      ...r,
      documentTitle: docMeta.get(r.documentId?.toString()) || 'Document',
    }));
  }

  if (mode === 'keyword') {
    return keywordResults.slice(0, limit);
  }

  // --- FUSION: Reciprocal Rank Fusion (RRF) ---
  const fused = reciprocalRankFusion(vectorResults, keywordResults, 60);

  // Return top-K fused results
  return fused.slice(0, limit);
};
