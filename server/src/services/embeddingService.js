import dotenv from 'dotenv';
dotenv.config();

const GEMINI_EMBEDDING_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-embedding-001:embedContent';
const OUTPUT_DIMS = 768;

/**
 * Generate a 768-dimensional embedding for a single text.
 */
export const getEmbedding = async (text) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }

  const cleanText = (text || '').trim();
  if (!cleanText) {
    return new Array(OUTPUT_DIMS).fill(0);
  }

  const url = `${GEMINI_EMBEDDING_URL}?key=${apiKey}`;

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: cleanText }] },
          outputDimensionality: OUTPUT_DIMS,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.embedding) {
        if (res.status === 429 && attempts < maxAttempts) {
          // Rate limit pause
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
          continue;
        }
        throw new Error(data.error?.message || `Embedding API returned status ${res.status}`);
      }

      return data.embedding.values;
    } catch (err) {
      if (attempts >= maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempts));
    }
  }

  throw new Error('Failed to generate embedding after retries');
};

/**
 * Generate embeddings for an array of texts sequentially or in small batches.
 */
export const getBatchEmbeddings = async (texts, onProgress) => {
  const embeddings = [];
  const batchSize = 5;

  for (let i = 0; i < texts.length; i += batchSize) {
    const slice = texts.slice(i, i + batchSize);
    const sliceResults = await Promise.all(slice.map((t) => getEmbedding(t)));
    embeddings.push(...sliceResults);

    if (onProgress) {
      onProgress(Math.min(100, Math.round(((i + slice.length) / texts.length) * 100)));
    }

    // Small delay between batches to comfortably stay well within free tier RPM
    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return embeddings;
};
