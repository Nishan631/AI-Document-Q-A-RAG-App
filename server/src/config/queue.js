import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processDocumentIngestion } from '../services/ingestionService.js';

let redisConnection = null;
let ingestionQueue = null;
let ingestionWorker = null;
let isRedisAvailable = false;

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const initQueue = async () => {
  try {
    const connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 2) {
          return null; // Stop retrying quickly to enable fallback
        }
        return Math.min(times * 200, 1000);
      },
      connectTimeout: 2000,
    });

    connection.on('error', (err) => {
      if (!isRedisAvailable) {
        // Suppress repeated spam if Redis is not running locally
      } else {
        console.warn(`[Queue:Redis Error] ${err.message}`);
      }
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Redis connection timed out'));
      }, 2500);

      connection.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });

      connection.once('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    redisConnection = connection;
    isRedisAvailable = true;

    // Create BullMQ queue
    ingestionQueue = new Queue('document-ingestion', { connection: redisConnection });

    // Create BullMQ worker
    ingestionWorker = new Worker(
      'document-ingestion',
      async (job) => {
        const { documentId } = job.data;
        console.log(`[BullMQ Worker] Processing job ${job.id} for doc ${documentId}`);
        return await processDocumentIngestion(documentId, (progress, step) => {
          job.updateProgress(progress);
        });
      },
      { connection: redisConnection, concurrency: 2 }
    );

    ingestionWorker.on('completed', (job) => {
      console.log(`[BullMQ Worker] Job ${job.id} completed successfully`);
    });

    ingestionWorker.on('failed', (job, err) => {
      console.error(`[BullMQ Worker] Job ${job?.id} failed:`, err.message);
    });

    console.log(`[Queue] BullMQ initialized successfully with Redis at ${redisUrl}`);
  } catch (err) {
    isRedisAvailable = false;
    console.log(
      `[Queue] Redis not detected at ${redisUrl}. Running background ingestion in async worker mode.`
    );
  }
};

/**
 * Enqueue an ingestion job.
 * If Redis & BullMQ are available, enqueues to BullMQ.
 * Otherwise, runs in background using setImmediate.
 */
export const addIngestionJob = async (documentId) => {
  if (isRedisAvailable && ingestionQueue) {
    const job = await ingestionQueue.add(
      'process-pdf',
      { documentId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
    return { mode: 'bullmq', jobId: job.id };
  } else {
    // Graceful asynchronous in-memory execution
    setImmediate(() => {
      processDocumentIngestion(documentId).catch((err) => {
        console.error(`[Async Worker] Error processing document ${documentId}:`, err);
      });
    });
    return { mode: 'in-memory', jobId: `local-${Date.now()}` };
  }
};
