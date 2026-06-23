const path = require('node:path');

// Baseline security headers for the admin. CSP keeps 'unsafe-inline' for now
// (Next's inline hydration/styles need it without a nonce pipeline); the value
// is still real defense-in-depth — it pins sources and blocks framing. Tighten
// to nonce-based script-src later.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
];

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Pin the workspace root to this folder so Next stops inferring it from a
  // parent lockfile (which also threw off relative path resolution).
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  serverExternalPackages: ['pg', 'nodemailer'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
