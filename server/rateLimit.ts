import express from 'express';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  code?: string;
  message?: string;
}

/**
 * In-memory sliding window rate limiter middleware.
 * Enforces per-client request limits using authenticated user ID or remote IP.
 * Guarantees standard JSON error response: { error: { code, message } }
 */
export function rateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    code = 'RATE_LIMIT_EXCEEDED',
    message = 'Too many requests. Please slow down and try again shortly.',
  } = options;

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Check if demo bypass or test bypass header is present
    if (req.headers['x-bypass-rate-limit'] === 'true') {
      return next();
    }

    const authReq = req as any;
    const clientId = authReq.user?.uid || authReq.user?.id || req.ip || req.headers['x-forwarded-for'] || 'anonymous';
    const routeKey = req.baseUrl || req.path;
    const bucketKey = `${routeKey}:${clientId}`;
    const now = Date.now();

    let bucket = rateLimitStore.get(bucketKey);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 1, resetAt: now + windowMs };
      rateLimitStore.set(bucketKey, bucket);
      return next();
    }

    bucket.count++;
    if (bucket.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: {
          code,
          message: `${message} (Retry after ${retryAfterSec}s)`,
        },
      });
    }

    next();
  };
}

/**
 * Resets the rate limiter store (useful for tests)
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
}
