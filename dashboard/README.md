# karst — admin dashboard (private)

## Overview

This is the private control panel for karst. Manage waitlist signups, design-partner CRM, MCP install tracking, feedback inbox, content, analytics. Built in Next.js 15 + Tailwind + better-sqlite3.

Not intended for public access — protect behind iron-session auth and a single admin user provisioned via environment variables.

## Architecture

- **Storage**: SQLite file at `./karst.db` (zero infra). All tables live in a single file — waitlist, design partners, install events, query events, feedback.
- **Auth**: iron-session cookie auth, single admin user from env. No registration flow.
- **Runtime**: Next.js 15 App Router, server actions + a few `/api/*` routes for CLI ingest.
- **Deployment target**: long-lived host with a persistent disk (Fly.io / Railway / VPS). Vercel needs a Postgres swap because SQLite can't share state across serverless invocations.

## Tech stack

- Next.js 15 (App Router, Server Components)
- React 18
- TypeScript
- Tailwind CSS
- better-sqlite3 (synchronous, embedded)
- iron-session (cookie sessions)
- Zod (request validation)
- Recharts (analytics views)

## Local dev quickstart

```bash
# 1. Install deps
pnpm install   # or: npm install

# 2. Copy env template and fill in values
cp .env.example .env

# 3. Generate admin password hash (paste into KARST_ADMIN_PASSWORD_HASH)
node -e "const c=require('node:crypto');const salt=c.randomBytes(16).toString('hex');const hash=c.scryptSync(process.argv[1],salt,64).toString('hex');console.log(salt+':'+hash)" 'your-password-here'

# 4. Generate session secret (paste into KARST_SESSION_SECRET)
openssl rand -hex 32

# 5. (Optional) seed dev data
pnpm db:seed

# 6. Run dev server
pnpm dev   # -> http://localhost:3001
```

## Env vars

| Variable | Required | Description |
|---|---|---|
| `KARST_SESSION_SECRET` | yes | 32-byte hex string for iron-session cookie encryption. |
| `KARST_ADMIN_EMAIL` | yes | Email used to log in. |
| `KARST_ADMIN_PASSWORD_HASH` | yes | `salt:hash` from the scrypt one-liner above. |
| `KARST_DATABASE_PATH` | no | Path to SQLite file. Defaults to `./karst.db`. Set to `/app/data/karst.db` on Fly. |
| `KARST_INGEST_TOKEN` | no | Optional shared secret required on `/api/ingest/*` from the CLI. |
| `NODE_ENV` | no | `production` in prod. |
| `PORT` | no | Defaults to `3001`. |

## Deploy options

| Option | Cost | Notes |
|---|---|---|
| **Fly.io (recommended)** | ~$3–5/mo | SQLite + persistent volume, one-region. Cheapest path with no DB rewrite. Sample `fly.toml` snippet below. |
| **Railway** | ~$5/mo | Simpler UX than Fly. Volume mount works the same. Steps below. |
| **Vercel (Pro $20/mo)** | $20/mo | Private repo support, but SQLite does **not** work on serverless. Requires Postgres swap (see plan below). |
| **Self-hosted VPS** | $4–6/mo (Hetzner/DO) | Most control. `docker-compose up -d` with a named volume. |

### Fly.io snippet (see full `fly.toml` in repo root)

```toml
app = "karst-dashboard"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  KARST_DATABASE_PATH = "/app/data/karst.db"

[[mounts]]
  source = "karst_data"
  destination = "/app/data"

[http_service]
  internal_port = 3001
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
```

### Railway steps

1. `railway login`
2. `railway init` from the `dashboard/` directory.
3. Add a Volume in the dashboard UI, mount at `/app/data`.
4. Set env vars in the Railway dashboard (same list as above, with `KARST_DATABASE_PATH=/app/data/karst.db`).
5. `railway up` — Railway autodetects the Dockerfile.
6. Add custom domain `admin.karst.dev` and follow the CNAME instructions.

### Vercel swap plan (only if you insist on Vercel)

SQLite cannot persist across serverless invocations. To deploy on Vercel:

1. Provision Vercel Postgres (or Neon / Supabase Postgres).
2. Replace `better-sqlite3` with `postgres` (or `drizzle-orm` + `pg`).
3. Port `lib/db.ts` queries — most are `prepare()` + `run/get/all`, which map 1:1 to parameterized SQL.
4. Migrate schema with a one-shot `schema.sql` applied via `psql`.
5. Set `DATABASE_URL` in Vercel project env.
6. Drop the volume code paths — Postgres is the source of truth.

This is a real port, not a config flip. The Fly.io path avoids all of it.

### Self-hosted VPS

```yaml
# docker-compose.yml
services:
  dashboard:
    build: .
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"
    env_file: .env
    volumes:
      - karst_data:/app/data
volumes:
  karst_data:
```

Put nginx / Caddy in front for TLS.

## How the CLI phones home

The `karst` CLI reads `KARST_INGEST_URL` from the user's environment and POSTs anonymized events to `/api/ingest/*` on each command:

- `/api/ingest/install` — first run on a machine. Sends an anonymous install id + OS/arch.
- `/api/ingest/query` — per command. Sends query type, latency, success/failure, model used. **No source code, no file paths, no prompt content.**
- `/api/ingest/error` — opt-in crash reports.

Default endpoint: `https://admin.karst.dev`.

Opt-out: users set `KARST_TELEMETRY=0` and the CLI skips all ingest calls.

## Backup

Snapshot `karst.db` to S3 nightly. SQLite's `.backup` is safe while the app is running — it uses the WAL.

```bash
# /etc/cron.d/karst-backup
0 3 * * *  root  sqlite3 /app/data/karst.db ".backup '/tmp/karst-$(date +\%F).db'" && \
           aws s3 cp /tmp/karst-$(date +\%F).db s3://karst-backups/ && \
           rm /tmp/karst-$(date +\%F).db
```

On Fly, run this from a scheduled Machine or a small companion container with the AWS CLI installed.
