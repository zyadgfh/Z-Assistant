/**
 * Minimal in-memory fixed-window rate limiter for the dashboard API routes
 * (per serverless instance — an honest first layer, not a global guarantee;
 * for exact global counting move to a durable store / middleware).
 *
 * Only a hashed-ish key (IP string) is kept; no request bodies or prompts are
 * stored, and the map is pruned periodically to avoid unbounded growth.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastPrune = Date.now();

function prune(now: number): void {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  /** Allowed requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: string;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
}

export function checkRateLimit(request: Request, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  prune(now);
  const key = clientIp(request);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1, resetAt: new Date(now + options.windowMs).toISOString() };
  }
  existing.count += 1;
  const remaining = Math.max(0, options.limit - existing.count);
  return { allowed: existing.count <= options.limit, remaining, resetAt: new Date(existing.resetAt).toISOString() };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt,
  };
}
