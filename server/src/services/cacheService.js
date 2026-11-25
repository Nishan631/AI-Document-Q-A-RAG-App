import crypto from 'crypto';
import IORedis from 'ioredis';

let redisClient = null;
let isRedisReady = false;

// In-memory fallback cache
const memoryCache = new Map();
const MAX_MEMORY_CACHE_SIZE = 500;

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Initialize Redis client gracefully
try {
  const client = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => (times > 2 ? null : 1000),
    connectTimeout: 2000,
  });

  client.on('connect', () => {
    isRedisReady = true;
    redisClient = client;
    console.log(`[Cache] Redis cache connected successfully at ${redisUrl}`);
  });

  client.on('error', () => {
    isRedisReady = false;
  });
} catch (e) {
  isRedisReady = false;
}

/**
 * Creates a normalized deterministic cache key for a question on a document or document set.
 */
export const getCacheKey = (documentIdOrList, question) => {
  const normalizedDoc = Array.isArray(documentIdOrList)
    ? documentIdOrList.sort().join(':')
    : String(documentIdOrList);

  const normalizedQuestion = question
    .toLowerCase()
    .trim()
    .replace(/[?!.,;]+$/, '');

  const hash = crypto.createHash('sha256').update(normalizedQuestion).digest('hex').slice(0, 16);
  return `rag:q:${normalizedDoc}:${hash}`;
};

/**
 * Retrieve cached Q&A result if available.
 */
export const getCachedQuery = async (documentIdOrList, question) => {
  const key = getCacheKey(documentIdOrList, question);

  if (isRedisReady && redisClient) {
    try {
      const data = await redisClient.get(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn(`[Cache Error] Redis get failed: ${err.message}`);
    }
  }

  // Fallback to in-memory cache
  const item = memoryCache.get(key);
  if (item) {
    if (Date.now() > item.expiresAt) {
      memoryCache.delete(key);
      return null;
    }
    return item.data;
  }

  return null;
};

/**
 * Store Q&A result in cache.
 */
export const setCachedQuery = async (documentIdOrList, question, data, ttlSeconds = 86400) => {
  const key = getCacheKey(documentIdOrList, question);
  const serialized = JSON.stringify(data);

  if (isRedisReady && redisClient) {
    try {
      await redisClient.set(key, serialized, 'EX', ttlSeconds);
      return;
    } catch (err) {
      console.warn(`[Cache Error] Redis set failed: ${err.message}`);
    }
  }

  // Fallback to in-memory cache
  if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE) {
    // Evict oldest item
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }

  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
};

/**
 * Invalidate cache for a document when it is updated or re-indexed.
 */
export const invalidateDocumentCache = async (documentId) => {
  const prefix = `rag:q:${documentId}:*`;

  if (isRedisReady && redisClient) {
    try {
      const keys = await redisClient.keys(prefix);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (e) {
      // Ignore cleanup error
    }
  }

  // Invalidate in memory
  for (const k of memoryCache.keys()) {
    if (k.includes(String(documentId))) {
      memoryCache.delete(k);
    }
  }
};
