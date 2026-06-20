import pg from 'pg';

const { Pool } = pg;

// node-postgres returns bigint (int8) and numeric as JS strings by default.
// Our ids, timestamps (unix-ms), COUNT(*) and AVG()/SUM() results are all well
// within Number.MAX_SAFE_INTEGER, so coerce them to numbers globally. This only
// touches int8 (OID 20) and numeric (OID 1700) — text columns are never affected.
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
pg.types.setTypeParser(1700, (v) => parseFloat(v));

// ---------- Types ----------
export type Signup = {
  id: number;
  email: string;
  source: string | null;
  notes: string | null;
  created_at: number;
};

export type PartnerStatus = 'lead' | 'contacted' | 'demo_booked' | 'piloting' | 'paying' | 'lost';

export type Partner = {
  id: number;
  name: string;
  email: string | null;
  company: string | null;
  vertical: string | null;
  status: PartnerStatus;
  last_touch: number | null;
  notes_md: string | null;
  created_at: number;
};

export type FeedbackSource = 'cli' | 'mcp' | 'email' | 'landing' | 'other';
export type FeedbackSeverity = 'bug' | 'idea' | 'question' | 'praise';
export type FeedbackStatus = 'new' | 'triaged' | 'replied' | 'closed';

export type Feedback = {
  id: number;
  source: FeedbackSource;
  message: string;
  contact: string | null;
  severity: FeedbackSeverity | null;
  status: FeedbackStatus;
  created_at: number;
};

export type Install = {
  id: number;
  anonymous_id: string;
  version: string | null;
  os: string | null;
  python_version: string | null;
  country: string | null;
  created_at: number;
};

export type Query = {
  id: number;
  anonymous_id: string;
  repo_size_chunks: number | null;
  tokens_used: number | null;
  cost_usd: number | null;
  used_packs: number;
  created_at: number;
};

export type BlogStatus = 'draft' | 'published';

export type BlogPost = {
  id: number;
  slug: string;
  title: string;
  body_md: string;
  status: BlogStatus;
  published_at: number | null;
  created_at: number;
};

// ---------- Postgres (Neon) ----------
// Local dev:   DATABASE_URL=postgres://user:pass@localhost:5432/karst  (no SSL)
// Production:  DATABASE_URL=postgres://...neon.tech/...?sslmode=require (Neon
//              pooled connection string)
//
// The schema is plain PostgreSQL. Timestamps are stored as BIGINT unix-ms (the
// app works in Date.now() milliseconds throughout), ids are BIGSERIAL.

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS signups (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    source TEXT,
    notes TEXT,
    created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS design_partners (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    company TEXT,
    vertical TEXT,
    status TEXT NOT NULL CHECK(status IN ('lead','contacted','demo_booked','piloting','paying','lost')) DEFAULT 'lead',
    last_touch BIGINT,
    notes_md TEXT,
    created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL CHECK(source IN ('cli','mcp','email','landing','other')),
    message TEXT NOT NULL,
    contact TEXT,
    severity TEXT CHECK(severity IN ('bug','idea','question','praise')) DEFAULT 'question',
    status TEXT NOT NULL CHECK(status IN ('new','triaged','replied','closed')) DEFAULT 'new',
    created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS installs (
    id BIGSERIAL PRIMARY KEY,
    anonymous_id TEXT NOT NULL,
    version TEXT,
    os TEXT,
    python_version TEXT,
    country TEXT,
    created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS queries (
    id BIGSERIAL PRIMARY KEY,
    anonymous_id TEXT NOT NULL,
    repo_size_chunks INTEGER,
    tokens_used INTEGER,
    cost_usd DOUBLE PRECISION,
    used_packs INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE,
    password_hash TEXT,
    created_at BIGINT
  );
  CREATE TABLE IF NOT EXISTS blog_posts (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    body_md TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('draft','published')) DEFAULT 'draft',
    published_at BIGINT,
    created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
  CREATE INDEX IF NOT EXISTS idx_signups_email ON signups(email);
  CREATE INDEX IF NOT EXISTS idx_design_partners_status ON design_partners(status);
  CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_installs_created ON installs(created_at);
  CREATE INDEX IF NOT EXISTS idx_queries_created ON queries(created_at);
  CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS session_epoch BIGINT;
`;

let _pool: pg.Pool | null = null;
let _ready: Promise<void> | null = null;

function makePool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  // Local Postgres speaks plaintext; hosted providers (Neon) require TLS.
  const isLocal = /@(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)(:|\/)/.test(
    connectionString
  );
  const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 5,
    // Close idle sockets before Neon's pooler/autosuspend drops them out from
    // under us (otherwise the next query sees "Connection terminated").
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // An error on an *idle* pooled client (Neon routinely closes idle sockets)
  // is emitted on the pool. With no listener Node re-throws it as an uncaught
  // exception, which kills the entire serverless instance. Handling it lets pg
  // quietly evict the dead client and open a fresh one on the next query.
  pool.on('error', (err) => {
    console.error('[pg] idle client error:', err);
  });
  return pool;
}

function rawPool(): pg.Pool {
  if (!_pool) _pool = makePool();
  return _pool;
}

type SqlArgs = unknown[];

type DbAdapter = {
  execute: (q: { sql: string; args?: SqlArgs } | string) => Promise<{ rows: any[] }>;
};

/** Returns a thin client with the schema guaranteed to exist. */
export async function getClient(): Promise<DbAdapter> {
  const pool = rawPool();
  if (!_ready) {
    _ready = pool
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((err: unknown) => {
        // Several cold-started instances can race on CREATE ... IF NOT EXISTS;
        // Postgres surfaces that as an "already exists"/"duplicate"/"tuple
        // concurrently updated" error which is harmless — the object exists.
        const msg = String((err as { message?: string })?.message || '').toLowerCase();
        if (
          msg.includes('already exists') ||
          msg.includes('duplicate key') ||
          msg.includes('tuple concurrently')
        ) {
          return undefined;
        }
        // A genuine failure (e.g. transient cold-start connection reset) must
        // NOT be cached, or the whole warm instance stays broken. Un-memoize so
        // the next request retries the bootstrap.
        _ready = null;
        throw err;
      });
  }
  await _ready;
  return {
    async execute(q) {
      const sql = typeof q === 'string' ? q : q.sql;
      const args = typeof q === 'string' ? [] : q.args ?? [];
      const res = await pool.query(toPg(sql), args as unknown[]);
      return { rows: res.rows };
    },
  };
}

const now = () => Date.now();

// Our SQL uses '?' positional placeholders (carried over from the SQLite layer);
// Postgres wants $1, $2, ... . No query embeds a literal '?' inside a string
// literal, so a left-to-right substitution is safe.
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// node-postgres already returns each row as a plain object keyed by column name,
// with int8/numeric coerced to numbers by the parsers registered above.
function rows<T>(r: { rows: any[] }): T[] {
  return r.rows as T[];
}
function first<T>(r: { rows: any[] }): T | null {
  return (r.rows[0] as T) ?? null;
}

// ---------- Signups ----------
export async function insertSignup(input: {
  email: string;
  source?: string;
  notes?: string;
}): Promise<Signup & { is_new: boolean }> {
  const db = await getClient();
  const r = await db.execute({
    sql: `INSERT INTO signups (email, source, notes, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET source = COALESCE(excluded.source, signups.source),
                                            notes = COALESCE(excluded.notes, signups.notes)
          RETURNING *, (xmax = 0) AS is_new`,
    args: [input.email, input.source ?? null, input.notes ?? null, now()],
  });
  return first<Signup & { is_new: boolean }>(r)!;
}

export async function listSignups(): Promise<Signup[]> {
  const db = await getClient();
  const r = await db.execute(`SELECT * FROM signups ORDER BY created_at DESC`);
  return rows<Signup>(r);
}

export async function searchSignups(q: string): Promise<Signup[]> {
  const db = await getClient();
  const term = `%${q}%`;
  const r = await db.execute({
    // ILIKE keeps the case-insensitive behaviour SQLite's LIKE had (Postgres
    // LIKE is case-sensitive).
    sql: `SELECT * FROM signups WHERE email ILIKE ? OR source ILIKE ? OR notes ILIKE ? ORDER BY created_at DESC`,
    args: [term, term, term],
  });
  return rows<Signup>(r);
}

// ---------- Partners ----------
export async function insertPartner(input: {
  name: string;
  email?: string;
  company?: string;
  vertical?: string;
  status: PartnerStatus;
  notes_md?: string;
}): Promise<Partner> {
  const db = await getClient();
  const r = await db.execute({
    sql: `INSERT INTO design_partners (name, email, company, vertical, status, last_touch, notes_md, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [
      input.name,
      input.email ?? null,
      input.company ?? null,
      input.vertical ?? null,
      input.status,
      now(),
      input.notes_md ?? null,
      now(),
    ],
  });
  return first<Partner>(r)!;
}

export async function updatePartner(id: number, patch: Partial<Partner>): Promise<Partner | null> {
  const allowed: (keyof Partner)[] = [
    'name', 'email', 'company', 'vertical', 'status', 'last_touch', 'notes_md',
  ];
  const sets: string[] = [];
  const vals: SqlArgs = [];
  for (const k of allowed) {
    if (k in patch) {
      sets.push(`${k} = ?`);
      vals.push((patch as Record<string, unknown>)[k] ?? null);
    }
  }
  if (sets.length === 0) return getPartner(id);
  vals.push(id);
  const db = await getClient();
  const r = await db.execute({
    sql: `UPDATE design_partners SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    args: vals,
  });
  return first<Partner>(r);
}

export async function listPartners(): Promise<Partner[]> {
  const db = await getClient();
  const r = await db.execute(`SELECT * FROM design_partners ORDER BY created_at DESC`);
  return rows<Partner>(r);
}

export async function getPartner(id: number): Promise<Partner | null> {
  const db = await getClient();
  const r = await db.execute({ sql: `SELECT * FROM design_partners WHERE id = ?`, args: [id] });
  return first<Partner>(r);
}

export async function promoteSignupToPartner(
  signupId: number,
  extra: Partial<{ name: string; company: string; vertical: string; notes_md: string }>
): Promise<Partner> {
  const db = await getClient();
  const sr = await db.execute({ sql: `SELECT * FROM signups WHERE id = ?`, args: [signupId] });
  const signup = first<Signup>(sr);
  if (!signup) throw new Error(`Signup ${signupId} not found`);
  const name = extra.name || signup.email.split('@')[0];
  return insertPartner({
    name,
    email: signup.email,
    company: extra.company,
    vertical: extra.vertical,
    status: 'contacted',
    notes_md: extra.notes_md,
  });
}

// ---------- Feedback ----------
export async function insertFeedback(input: {
  source: FeedbackSource;
  message: string;
  contact?: string;
  severity?: FeedbackSeverity;
}): Promise<Feedback> {
  const db = await getClient();
  const r = await db.execute({
    sql: `INSERT INTO feedback (source, message, contact, severity, status, created_at)
          VALUES (?, ?, ?, ?, 'new', ?) RETURNING *`,
    args: [input.source, input.message, input.contact ?? null, input.severity ?? 'question', now()],
  });
  return first<Feedback>(r)!;
}

export async function listFeedback(filters?: {
  status?: FeedbackStatus;
  source?: FeedbackSource;
  severity?: FeedbackSeverity;
}): Promise<Feedback[]> {
  const where: string[] = [];
  const vals: SqlArgs = [];
  if (filters?.status) { where.push('status = ?'); vals.push(filters.status); }
  if (filters?.source) { where.push('source = ?'); vals.push(filters.source); }
  if (filters?.severity) { where.push('severity = ?'); vals.push(filters.severity); }
  const sql =
    `SELECT * FROM feedback` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY created_at DESC`;
  const db = await getClient();
  const r = await db.execute({ sql, args: vals });
  return rows<Feedback>(r);
}

export async function getFeedback(id: number): Promise<Feedback | null> {
  const db = await getClient();
  const r = await db.execute({ sql: `SELECT * FROM feedback WHERE id = ?`, args: [id] });
  return first<Feedback>(r);
}

export async function updateFeedback(id: number, patch: Partial<Feedback>): Promise<Feedback | null> {
  const allowed: (keyof Feedback)[] = ['status', 'severity', 'message', 'contact', 'source'];
  const sets: string[] = [];
  const vals: SqlArgs = [];
  for (const k of allowed) {
    if (k in patch) {
      sets.push(`${k} = ?`);
      vals.push((patch as Record<string, unknown>)[k] ?? null);
    }
  }
  if (sets.length === 0) return getFeedback(id);
  vals.push(id);
  const db = await getClient();
  const r = await db.execute({
    sql: `UPDATE feedback SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    args: vals,
  });
  return first<Feedback>(r);
}

// ---------- Installs ----------
export async function insertInstall(input: {
  anonymous_id: string;
  version: string;
  os: string;
  python_version?: string;
  country?: string;
}): Promise<Install> {
  const db = await getClient();
  const r = await db.execute({
    sql: `INSERT INTO installs (anonymous_id, version, os, python_version, country, created_at)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [input.anonymous_id, input.version, input.os, input.python_version ?? null, input.country ?? null, now()],
  });
  return first<Install>(r)!;
}

export async function listInstalls(limit = 100): Promise<Install[]> {
  const db = await getClient();
  const r = await db.execute({
    sql: `SELECT * FROM installs ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  });
  return rows<Install>(r);
}

export async function installsPerDay(days: number): Promise<{ date: string; count: number }[]> {
  const db = await getClient();
  const since = now() - days * 24 * 60 * 60 * 1000;
  const r = await db.execute({
    sql: `SELECT to_char(to_timestamp(created_at / 1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                 COUNT(*) AS count
          FROM installs WHERE created_at >= ? GROUP BY 1 ORDER BY 1 ASC`,
    args: [since],
  });
  return rows<{ date: string; count: number }>(r);
}

// ---------- Queries ----------
export async function insertQuery(input: {
  anonymous_id: string;
  repo_size_chunks: number;
  tokens_used: number;
  cost_usd: number;
  used_packs: number;
}): Promise<Query> {
  const db = await getClient();
  const r = await db.execute({
    sql: `INSERT INTO queries (anonymous_id, repo_size_chunks, tokens_used, cost_usd, used_packs, created_at)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [input.anonymous_id, input.repo_size_chunks, input.tokens_used, input.cost_usd, input.used_packs, now()],
  });
  return first<Query>(r)!;
}

export async function queriesPerDay(days: number): Promise<{ date: string; count: number }[]> {
  const db = await getClient();
  const since = now() - days * 24 * 60 * 60 * 1000;
  const r = await db.execute({
    sql: `SELECT to_char(to_timestamp(created_at / 1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                 COUNT(*) AS count
          FROM queries WHERE created_at >= ? GROUP BY 1 ORDER BY 1 ASC`,
    args: [since],
  });
  return rows<{ date: string; count: number }>(r);
}

export async function avgCostPerQuery(): Promise<number> {
  const db = await getClient();
  const r = await db.execute(`SELECT AVG(cost_usd) AS avg FROM queries WHERE cost_usd IS NOT NULL`);
  const row = first<{ avg: number | null }>(r);
  return row?.avg ?? 0;
}

export async function costPerDay(days: number): Promise<{ date: string; avg_cost: number }[]> {
  const db = await getClient();
  const since = now() - days * 24 * 60 * 60 * 1000;
  const r = await db.execute({
    sql: `SELECT to_char(to_timestamp(created_at / 1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                 AVG(cost_usd) AS avg_cost
          FROM queries
          WHERE created_at >= ? AND cost_usd IS NOT NULL
          GROUP BY 1
          ORDER BY 1 ASC`,
    args: [since],
  });
  return rows<{ date: string; avg_cost: number }>(r);
}

export async function computeTokensSavedEstimate(): Promise<number> {
  const db = await getClient();
  const r = await db.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN used_packs = 1 THEN tokens_used * 1.5 ELSE 0 END), 0)
       - COALESCE(SUM(tokens_used), 0) AS saved
     FROM queries`
  );
  const row = first<{ saved: number }>(r);
  return Math.max(0, Math.round(row?.saved ?? 0));
}

// ---------- Blog Posts ----------
export async function insertBlogPost(input: {
  slug: string;
  title: string;
  body_md: string;
  status: BlogStatus;
}): Promise<BlogPost> {
  const db = await getClient();
  const published_at = input.status === 'published' ? now() : null;
  const r = await db.execute({
    sql: `INSERT INTO blog_posts (slug, title, body_md, status, published_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [input.slug, input.title, input.body_md, input.status, published_at, now()],
  });
  return first<BlogPost>(r)!;
}

export async function updateBlogPost(id: number, patch: Partial<BlogPost>): Promise<BlogPost | null> {
  const allowed: (keyof BlogPost)[] = ['slug', 'title', 'body_md', 'status', 'published_at'];
  const sets: string[] = [];
  const vals: SqlArgs = [];
  for (const k of allowed) {
    if (k in patch) {
      sets.push(`${k} = ?`);
      vals.push((patch as Record<string, unknown>)[k] ?? null);
    }
  }
  if (patch.status === 'published' && !('published_at' in patch)) {
    const existing = await getBlogPostById(id);
    if (existing && !existing.published_at) {
      sets.push('published_at = ?');
      vals.push(now());
    }
  }
  if (sets.length === 0) return getBlogPostById(id);
  vals.push(id);
  const db = await getClient();
  const r = await db.execute({
    sql: `UPDATE blog_posts SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    args: vals,
  });
  return first<BlogPost>(r);
}

export async function getBlogPostById(id: number): Promise<BlogPost | null> {
  const db = await getClient();
  const r = await db.execute({ sql: `SELECT * FROM blog_posts WHERE id = ?`, args: [id] });
  return first<BlogPost>(r);
}

export async function listBlogPosts(status?: BlogStatus): Promise<BlogPost[]> {
  const db = await getClient();
  const r = status
    ? await db.execute({ sql: `SELECT * FROM blog_posts WHERE status = ? ORDER BY created_at DESC`, args: [status] })
    : await db.execute(`SELECT * FROM blog_posts ORDER BY created_at DESC`);
  return rows<BlogPost>(r);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const db = await getClient();
  const r = await db.execute({ sql: `SELECT * FROM blog_posts WHERE slug = ?`, args: [slug] });
  return first<BlogPost>(r);
}

// ---------- KPIs ----------
export async function getKpis(): Promise<{
  new_signups_24h: number;
  installs_7d: number;
  queries_24h: number;
  open_feedback: number;
  total_partners: number;
  avg_cost_query: number;
}> {
  const db = await getClient();
  const t = now();
  const day = 24 * 60 * 60 * 1000;
  const week = 7 * day;

  const n = async (sql: string, args: SqlArgs = []) => {
    const r = await db.execute({ sql, args });
    const row = first<{ c: number }>(r);
    return row?.c ?? 0;
  };

  const new_signups_24h = await n(`SELECT COUNT(*) AS c FROM signups WHERE created_at >= ?`, [t - day]);
  const installs_7d = await n(`SELECT COUNT(DISTINCT anonymous_id) AS c FROM installs WHERE created_at >= ?`, [t - week]);
  const queries_24h = await n(`SELECT COUNT(*) AS c FROM queries WHERE created_at >= ?`, [t - day]);
  const open_feedback = await n(`SELECT COUNT(*) AS c FROM feedback WHERE status = 'new'`);
  const total_partners = await n(`SELECT COUNT(*) AS c FROM design_partners`);

  const avgRes = await db.execute({
    sql: `SELECT AVG(cost_usd) AS a FROM queries WHERE created_at >= ? AND cost_usd IS NOT NULL`,
    args: [t - week],
  });
  const avg_cost_query = first<{ a: number | null }>(avgRes)?.a ?? 0;

  return { new_signups_24h, installs_7d, queries_24h, open_feedback, total_partners, avg_cost_query };
}

// ---------- Admin auth (DB-backed password, for self-serve reset) ----------
// The admin password starts from KARST_ADMIN_PASSWORD_HASH (env). Once the admin
// resets it, the new hash lives here and takes precedence over the env value.
export async function getAdminPasswordHash(email: string): Promise<string | null> {
  const db = await getClient();
  const r = await db.execute({
    sql: `SELECT password_hash FROM admin_users WHERE lower(email) = lower(?) LIMIT 1`,
    args: [email],
  });
  return first<{ password_hash: string | null }>(r)?.password_hash ?? null;
}

export async function setAdminPasswordHash(email: string, passwordHash: string): Promise<void> {
  const db = await getClient();
  const ts = now();
  // Bump session_epoch on every password change so existing sessions (which
  // carry the old epoch) are invalidated by getSession.
  await db.execute({
    sql: `INSERT INTO admin_users (email, password_hash, session_epoch, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash,
                                            session_epoch = excluded.session_epoch`,
    args: [email.toLowerCase(), passwordHash, ts, ts],
  });
}

export async function getAdminSessionEpoch(email: string): Promise<number> {
  const db = await getClient();
  const r = await db.execute({
    sql: `SELECT session_epoch FROM admin_users WHERE lower(email) = lower(?) LIMIT 1`,
    args: [email],
  });
  return Number(first<{ session_epoch: number | null }>(r)?.session_epoch ?? 0);
}

// ---------- Password resets ----------
/** True if a reset for this email was created at/after `sinceMs` (rate limit). */
export async function recentPasswordResetExists(email: string, sinceMs: number): Promise<boolean> {
  const db = await getClient();
  const r = await db.execute({
    sql: `SELECT 1 FROM password_resets WHERE lower(email) = lower(?) AND created_at >= ? LIMIT 1`,
    args: [email, sinceMs],
  });
  return r.rows.length > 0;
}

export async function createPasswordReset(email: string, tokenHash: string, expiresAt: number): Promise<void> {
  const db = await getClient();
  const lower = email.toLowerCase();
  // Only the newest link should work: invalidate any still-outstanding tokens
  // for this email, and opportunistically prune long-dead rows.
  await db.execute({ sql: `UPDATE password_resets SET used = 1 WHERE lower(email) = lower(?) AND used = 0`, args: [lower] });
  await db.execute({ sql: `DELETE FROM password_resets WHERE used = 1 AND expires_at < ?`, args: [now() - 24 * 60 * 60 * 1000] });
  await db.execute({
    sql: `INSERT INTO password_resets (email, token_hash, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)`,
    args: [lower, tokenHash, expiresAt, now()],
  });
}

/** Atomically consume a valid (unused, unexpired) reset token. Returns the
 *  associated email if it was valid, else null. */
export async function consumePasswordReset(tokenHash: string): Promise<string | null> {
  const db = await getClient();
  const r = await db.execute({
    sql: `UPDATE password_resets SET used = 1
          WHERE token_hash = ? AND used = 0 AND expires_at > ?
          RETURNING email`,
    args: [tokenHash, now()],
  });
  return first<{ email: string }>(r)?.email ?? null;
}
