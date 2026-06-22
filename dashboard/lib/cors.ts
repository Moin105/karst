const DEFAULT_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const DEFAULT_HEADERS = 'Content-Type, Authorization, X-Requested-With';

function getAllowedOrigins(): string[] {
  const raw = process.env.KARST_ALLOWED_ORIGINS || '';
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

function isOriginAllowed(origin: string, allowed: string[]): boolean {
  // No wildcard: responses set Access-Control-Allow-Credentials: true, and the
  // CORS spec forbids combining that with '*'. Only exact, explicitly-allowed
  // origins are reflected — so a malicious site can never make a credentialed
  // cross-origin request to the admin.
  return allowed.includes(origin);
}

export function withCors(response: Response, origin: string | null): Response {
  if (!origin) return response;
  const allowed = getAllowedOrigins();
  if (!isOriginAllowed(origin, allowed)) return response;

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', DEFAULT_METHODS);
  headers.set('Access-Control-Allow-Headers', DEFAULT_HEADERS);
  headers.set('Access-Control-Allow-Credentials', 'true');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handleOptions(request: Request): Response {
  const origin = request.headers.get('origin');
  const allowed = getAllowedOrigins();

  if (!origin || !isOriginAllowed(origin, allowed)) {
    return new Response(null, { status: 204 });
  }

  const requestedHeaders = request.headers.get('access-control-request-headers');

  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', DEFAULT_METHODS);
  headers.set('Access-Control-Allow-Headers', requestedHeaders || DEFAULT_HEADERS);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Max-Age', '86400');

  return new Response(null, { status: 204, headers });
}
