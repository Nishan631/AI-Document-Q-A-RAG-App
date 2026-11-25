import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for question answering endpoints (/ask)
 * Limits each user / IP to 30 requests per minute to control API costs.
 */
export const askRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 questions per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Key by authenticated userId if available, else by client IP
    return req.user?._id?.toString() || req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit reached: Maximum 30 questions per minute allowed per user to control API costs. Please wait a moment before asking again.',
    });
  },
});

/**
 * Rate limiter for document uploads (max 10 uploads per 10 minutes)
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: {
    error: 'Upload rate limit exceeded: Maximum 10 document uploads per 10 minutes.',
  },
});
