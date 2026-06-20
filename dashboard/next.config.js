const path = require('node:path');

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Pin the workspace root to this folder so Next stops inferring it from a
  // parent lockfile (which also threw off relative path resolution).
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  serverExternalPackages: ['@libsql/client', '@libsql/isomorphic-ws'],
};
