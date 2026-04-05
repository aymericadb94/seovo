/**
 * In-memory rate limiter for API routes.
 *
 * Tracks requests per user (by userId) with a sliding window.
 * Designed for single-instance deployments (Vercel serverless).
 * For multi-instance, replace with Redis/Upstash.
 */

type Entry = { timestamps: number[] };

const stores = new Map<string, Map<string, Entry>>();

// Auto-cleanup every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [, store] of stores) {
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter(t => now - t < 3600_000);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }
}, 300_000);

type RateLimitConfig = {
  /** Unique name for this limiter (e.g. "generate", "seo-analysis") */
  name: string;
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

export function checkRateLimit(userId: string, config: RateLimitConfig): RateLimitResult {
  const { name, maxRequests, windowSeconds } = config;
  const windowMs = windowSeconds * 1000;
  const now = Date.now();

  if (!stores.has(name)) stores.set(name, new Map());
  const store = stores.get(name)!;

  if (!store.has(userId)) store.set(userId, { timestamps: [] });
  const entry = store.get(userId)!;

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(oldestInWindow + windowMs),
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    resetAt: new Date(now + windowMs),
  };
}

/**
 * Returns a 429 Response if rate limited, or null if allowed.
 * Usage: const limited = rateLimit(userId, config); if (limited) return limited;
 */
export function rateLimit(userId: string, config: RateLimitConfig): Response | null {
  const result = checkRateLimit(userId, config);
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
    return Response.json(
      {
        error: "Trop de requêtes. Veuillez patienter avant de réessayer.",
        retry_after: retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": result.resetAt.toISOString(),
        },
      }
    );
  }
  return null;
}
