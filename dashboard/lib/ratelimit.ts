// Lightweight in-memory per-key rate limiter (fixed window).
//
// NOTE: state lives in this process, so on a multi-instance serverless host
// (Vercel) it throttles bursts hitting a warm instance but is NOT a global
// limit. It still stops the trivial "bash loop with curl" attack and adds real
// DoS resistance with zero deps. For production-grade global limits, back this
// with Upstash / Vercel KV — but this is a meaningful first line of defense.

type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Hit>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}
