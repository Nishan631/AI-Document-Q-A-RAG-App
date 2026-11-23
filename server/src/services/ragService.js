import mongoose from 'mongoose';
import { Chunk } from '../models/Chunk.js';
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
 * Searches the most semantically relevant chunks for a user question.
 * Uses Atlas $vectorSearch with fallback to in-memory cosine similarity.
 */
export const searchSimilarChunks = async ({ userId, documentId, query, limit = 5 }) => {
  // 1. Embed the user's question
  const queryVector = await getEmbedding(query);

  const uId = new mongoose.Types.ObjectId(userId);
  const dId = new mongoose.Types.ObjectId(documentId);

  // 2. Try MongoDB Atlas native $vectorSearch aggregation
  try {
    const pipeline = [
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryVector,
          numCandidates: 50,
          limit: limit,
          filter: {
            userId: { $eq: uId },
            documentId: { $eq: dId },
          },
        },
      },
      {
        $project: {
          _id: 1,
          pageNumber: 1,
          text: 1,
          chunkIndex: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const results = await Chunk.aggregate(pipeline);

    if (results && results.length > 0) {
      return results.map((r) => ({
        chunkId: r._id,
        pageNumber: r.pageNumber,
        text: r.text,
        snippet: r.text.slice(0, 180) + '...',
        score: r.score,
        chunkIndex: r.chunkIndex,
      }));
    }
  } catch (atlasSearchErr) {
    // If the vector index doesn't exist yet or is building, fallback gracefully
    console.warn(
      `[Atlas Vector Search Note] ${atlasSearchErr.message}. Utilizing exact fallback cosine similarity.`
    );
  }

  // 3. Fallback: Exact Cosine Similarity query
  const chunks = await Chunk.find({
    userId: uId,
    documentId: dId,
  }).select('_id pageNumber text embedding chunkIndex');

  if (!chunks || chunks.length === 0) {
    return [];
  }

  const scored = chunks
    .map((chunk) => {
      const score = cosineSimilarity(queryVector, chunk.embedding);
      return {
        chunkId: chunk._id,
        pageNumber: chunk.pageNumber,
        text: chunk.text,
        snippet: chunk.text.slice(0, 180) + '...',
        score,
        chunkIndex: chunk.chunkIndex,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
};
