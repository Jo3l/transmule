/**
 * Simple in-memory rate limiter for public endpoints.
 *
 * The middleware is a single process per container, so a Map is enough: no
 * Redis, no extra dependency. Entries are swept lazily on each hit.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Count one attempt for `key`. When the window elapses the bucket restarts.
 *
 * @param key   Identifier for the subject (e.g. `unlock:<ip>:<shareId>`).
 * @param limit Maximum attempts allowed inside the window.
 * @param windowMs Window length in milliseconds.
 */
export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  if (bucket.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds };
}

/** Drop a bucket, e.g. after a successful unlock so the counter resets. */
export function reset(key: string): void {
  buckets.delete(key);
}

/** Test/maintenance helper; not called from request paths. */
export function clear(): void {
  buckets.clear();
}

/** Prevent unbounded growth if the process lives for months. */
export function sweep(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
