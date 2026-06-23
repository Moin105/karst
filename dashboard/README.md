# karst — admin dashboard (private)

## Overview

This is the private control panel for karst. Manage waitlist signups, design-partner CRM, MCP install tracking, feedback inbox, content, and analytics. Built in Next.js 15 + Tailwind + Postgres (`pg`), deployed serverless on Vercel.

Not intended for public access — protect behind iron-session auth and a single admin user provisioned via environment variables.

## Architecture

- **Storage**: Neon (managed PostgreSQL), reached over `DATABASE_URL` via a `pg` connection pool in [`lib/db.ts`](lib/db.ts). Tables: signups, design partners, installs, queries, feedback, blog posts, admin users, password resets.
- **Auth**: iron-session cookie auth, single admin user seeded from env. No registration flow; password can be self-reset (the new hash is then stored in the DB and takes precedence over the env value).
- **Runtime**: Next.js 15 App Router — server actions for the admin UI, plus a few `/api/*` routes for CLI ingest and the public landing forms.
- **Deployment**: Vercel serverless. SQLite was used in an earlier iteration but is gone — serverless functions can't share a SQLite file across invocations, so the store is managed Postgres.

## Tech stack

- Next.js 15 (App Router, Server Components) + React 19
- TypeScript
- Tailwind CSS
- `pg` (node-postgres)
- iron-session (cookie sessions)
- Zod (request validation)
- Recharts (analytics views)
- Nodemailer (transactional email)

## Local dev quickstart

```bash
# 1. Install deps
npm install

# 2. Copy env template (db:migrate / db:seed read .env.local)
cp .env.example .env.local

# 3. Set DATABASE_URL in .env.local
#    Local Postgres:  postgres://user:pass@localhost:5432/karst
#    Neon (pooled):   postgres://<user>:<pass>@<host>-pooler.<region>.aws.neon.tech/<db>?sslmode=require

# 4. Generate admin password hash → paste into KARST_ADMIN_PASSWORD_HASH
npm run hash-password

# 5. Generate session secret → paste into KARST_SESSION_SECRET
openssl rand -hex 32

# 6. Apply the schema
npm run db:migrate

# 7. (Optional) seed dev data
npm run db:seed

# 8. Run dev server
npm run dev   # -> http://localhost:3001
```

## Env vars

Canonical list lives in [`.env.example`](.env.example).

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (Neon pooled string in prod). SSL is enabled automatically for non-local hosts. |
| `KARST_SESSION_SECRET` | yes | 32-byte (min) secret for iron-session cookie encryption. |
| `KARST_ADMIN_EMAIL` | yes | Email used to log in. |
| `KARST_ADMIN_PASSWORD_HASH` | yes | `scrypt:N=...:salt:hash` from `npm run hash-password`. |
| `KARST_ALLOWED_ORIGINS` | yes | CORS allowlist for the public landing forms (waitlist + feedback). Comma-separated exact origins, no wildcard — must include the live landing URL. |
| `KARST_PUBLIC_URL` | no | Public origin of this dashboard, used to build safe password-reset links. Optional on Vercel (`VERCEL_URL` is auto-injected); required on non-Vercel hosts or reset emails won't send. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | no | SMTP via Nodemailer. Leave empty to disable email (signups still work). |
| `EMAIL_REPLY_TO` / `OWNER_NOTIFY_EMAIL` | no | Optional reply-to and owner-notification addresses. |

## Deploy (Vercel + Neon Postgres)

The canonical end-to-end walkthrough is in [`docs/DEPLOY.md`](../docs/DEPLOY.md) §4. In short:

1. **Provision Neon.** Create a project at <https://neon.tech> and copy the **pooled** connection string (`...-pooler...?sslmode=require`).
2. **Apply the schema once** against the Neon database before serving traffic:
   ```bash
   DATABASE_URL='postgres://...neon.tech/...?sslmode=require' npm run db:migrate
   ```
   (The runtime in `lib/db.ts` also bootstraps the schema with `CREATE ... IF NOT EXISTS` on cold start, but migrating once avoids concurrent-DDL races across serverless instances.)
3. **Import the repo into Vercel** with the project root set to `dashboard/`.
4. **Set the env vars** above in the Vercel project settings. `DATABASE_URL` is the Neon pooled string; include the live landing origin(s) in `KARST_ALLOWED_ORIGINS`.
5. **Deploy.** Verify with the health check:
   ```bash
   curl https://<your-deployment>.vercel.app/api/health
   # -> {"ok":true,"db":"postgres","schema_ready":true}
   ```

## How the CLI phones home

The `karst` CLI reads `KARST_INGEST_URL` from the user's environment and POSTs anonymized events to the dashboard:

- `/api/ingest/install` — first run on a machine. Sends an anonymous install id + version/OS.
- `/api/ingest/query` — per command. Sends repo size, tokens, cost, pack usage. **No source code, no file paths, no prompt content.**
- `/api/ingest/feedback` — feedback submitted from the CLI/MCP.

The public landing waitlist posts to `/api/waitlist`. The production instance currently lives at its `*.vercel.app` URL (a custom `admin.karst.dev` domain will front it once DNS is wired).

Opt-out: users set `KARST_TELEMETRY=0` and the CLI skips all ingest calls.

## Backup

Neon provides automated backups and point-in-time restore — no manual backup cron is needed.
