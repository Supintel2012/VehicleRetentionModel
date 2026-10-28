/**
 * Best-effort sliding-window rate limit, held in this server instance's
 * memory. Serverless platforms run several instances and recycle them, so
 * this bounds bursts from one client; it is not a global quota.
 */

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

export interface RateLimiter {
  /** Record an attempt for `key` and say whether it is within the limit. */
  check(key: string): RateLimitDecision;
}

export interface RateLimiterOptions {
  /** Attempts allowed per key within `windowMs`. */
  limit: number;
  windowMs: number;
  /** Keys tracked at once; the least recently seen key is dropped beyond this. */
  maxKeys?: number;
  now?: () => number;
}

export function createRateLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key) {
      const time = now();
      const recent = (hits.get(key) ?? []).filter((at) => at > time - windowMs);
      // Re-insert so Map order tracks recency for eviction.
      hits.delete(key);
      hits.set(key, recent);
      if (recent.length >= limit) {
        return { allowed: false, retryAfterMs: Math.max(1, recent[0] + windowMs - time) };
      }
      recent.push(time);
      if (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return { allowed: true };
    },
  };
}
