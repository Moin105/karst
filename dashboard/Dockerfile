# syntax=docker/dockerfile:1.6

# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app

# better-sqlite3 needs a C++ toolchain to build its native binding
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# ---------- build ----------
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && pnpm build; \
    else \
      npm run build; \
    fi

# ---------- runner ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV KARST_DATABASE_PATH=/app/data/karst.db

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && mkdir -p /app/data \
 && chown -R nextjs:nodejs /app

# Next.js standalone output bundles the minimal server + node_modules it needs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3001

CMD ["node", "server.js"]
