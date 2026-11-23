/**
 * Daily per-client rate limiter with a clear ceiling.
 *
 * v1 uses in-process memory (honest limitation: it counts per worker isolate
 * and resets on deploy). For exact global counting, bind Workers KV or a
 * Durable Object — documented in README-ar.md as the first production step.
 * No request bodies or user text are stored here, only a hashed key.
 */

export interface RateLimitState {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** ISO timestamp when the daily window resets. */
  resetAt: string;
}

interface Bucket {
  /** UTC date string, e.g. 2026-11-23. */
  day: string;
  count: number;
}

export class DailyRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private dayKey(now: Date): string {
    return now.toISOString().slice(0, 10);
  }

  private resetAt(now: Date): string {
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow.toISOString();
  }

  check(key: string): RateLimitState {
    const now = this.now();
    const day = this.dayKey(now);
    const bucket = this.buckets.get(key);
    const used = bucket && bucket.day === day ? bucket.count : 0;
    return {
      allowed: used < this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - used),
      resetAt: this.resetAt(now),
    };
  }

  /** Consume one request; returns false when the daily ceiling is reached. */
  consume(key: string): RateLimitState {
    // The admission decision is the pre-increment check; the returned state
    // reflects the bucket after consuming so headers stay accurate.
    const pre = this.check(key);
    if (!pre.allowed) return pre;
    const now = this.now();
    const day = this.dayKey(now);
    const bucket = this.buckets.get(key);
    if (bucket && bucket.day === day) {
      bucket.count += 1;
    } else {
      this.buckets.set(key, { day, count: 1 });
    }
    const post = this.check(key);
    return { ...post, allowed: true };
  }
}
