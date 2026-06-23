import { createHash, timingSafeEqual } from 'node:crypto';

// Shared bearer-token auth for the machine-to-machine social endpoints (n8n →
// dashboard). The secret is KARST_SOCIAL_INGEST_TOKEN; with it unset the
// pipeline is disabled (fail closed).
export function socialIngestToken(): string | null {
  return process.env.KARST_SOCIAL_INGEST_TOKEN || null;
}

/** Constant-time check of the request's `Authorization: Bearer <token>`. */
export function socialIngestAuthorized(request: Request): boolean {
  const expected = socialIngestToken();
  if (!expected) return false;
  const auth = request.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return false;
  // Compare fixed-length SHA-256 digests so neither the length nor the content
  // of the secret leaks through comparison timing.
  const a = createHash('sha256').update(token).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
