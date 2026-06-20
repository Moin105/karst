import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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

// ---------- Singleton DB ----------
let _db: Database.Database | null = null;

function ensureSchema(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS signups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      source TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS design_partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      company TEXT,
      vertical TEXT,
      status TEXT NOT NULL CHECK(status IN ('lead','contacted','demo_booked','piloting','paying','lost')) DEFAULT 'lead',
      last_touch INTEGER,
      notes_md TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL CHECK(source IN ('cli','mcp','email','landing','other')),
      message TEXT NOT NULL,
      contact TEXT,
      severity TEXT CHECK(severity IN ('bug','idea','question','praise')) DEFAULT 'question',
      status TEXT NOT NULL CHECK(status IN ('new','triaged','replied','closed')) DEFAULT 'new',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS installs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anonymous_id TEXT NOT NULL,
      version TEXT,
      os TEXT,
      python_version TEXT,
      country TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anonymous_id TEXT NOT NULL,
      repo_size_chunks INTEGER,
      tokens_used INTEGER,
      cost_usd REAL,
      used_packs INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS blog_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      body_md TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('draft','published')) DEFAULT 'draft',
      published_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_signups_email ON signups(email);
    CREATE INDEX IF NOT EXISTS idx_design_partners_status ON design_partners(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_installs_created ON installs(created_at);
    CREATE INDEX IF NOT EXISTS idx_queries_created ON queries(created_at);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
  `);
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.KARST_DATABASE_PATH || './karst.db';
  const dir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(dbPath);
  ensureSchema(_db);
  return _db;
}

const now = () => Date.now();

// ---------- Signups ----------
export function insertSignup(input: { email: string; source?: string; notes?: string }): Signup {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO signups (email, source, notes, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET source = COALESCE(excluded.source, signups.source),
                                       notes = COALESCE(excluded.notes, signups.notes)
     RETURNING *`
  );
  return stmt.get(input.email, input.source ?? null, input.notes ?? null, now()) as Signup;
}

export function listSignups(): Signup[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM signups ORDER BY created_at DESC`).all() as Signup[];
}

export function searchSignups(q: string): Signup[] {
  const db = getDb();
  const term = `%${q}%`;
  return db
    .prepare(
      `SELECT * FROM signups WHERE email LIKE ? OR source LIKE ? OR notes LIKE ? ORDER BY created_at DESC`
    )
    .all(term, term, term) as Signup[];
}

// ---------- Partners ----------
export function insertPartner(input: {
  name: string;
  email?: string;
  company?: string;
  vertical?: string;
  status: PartnerStatus;
  notes_md?: string;
}): Partner {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO design_partners (name, email, company, vertical, status, last_touch, notes_md, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  );
  return stmt.get(
    input.name,
    input.email ?? null,
    input.company ?? null,
    input.vertical ?? null,
    input.status,
    now(),
    input.notes_md ?? null,
    now()
  ) as Partner;
}

export function updatePartner(id: number, patch: Partial<Partner>): Partner | null {
  const db = getDb();
  const allowed: (keyof Partner)[] = [
    'name',
    'email',
    'company',
    'vertical',
    'status',
    'last_touch',
    'notes_md',
  ];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const k of allowed) {
    if (k in patch) {
      sets.push(`${k} = ?`);
      vals.push((patch as any)[k]);
    }
  }
  if (sets.length === 0) return getPartner(id);
  vals.push(id);
  const stmt = db.prepare(`UPDATE design_partners SET ${sets.join(', ')} WHERE id = ? RETURNING *`);
  return (stmt.get(...vals) as Partner) || null;
}

export function listPartners(): Partner[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM design_partners ORDER BY created_at DESC`)
    .all() as Partner[];
}

export function getPartner(id: number): Partner | null {
  const db = getDb();
  return (db.prepare(`SELECT * FROM design_partners WHERE id = ?`).get(id) as Partner) || null;
}

export function promoteSignupToPartner(
  signupId: number,
  extra: Partial<{ name: string; company: string; vertical: string; notes_md: string }>
): Partner {
  const db = getDb();
  const signup = db.prepare(`SELECT * FROM signups WHERE id = ?`).get(signupId) as Signup | undefined;
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
export function insertFeedback(input: {
  source: FeedbackSource;
  message: string;
  contact?: string;
  severity?: FeedbackSeverity;
}): Feedback {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO feedback (source, message, contact, severity, status, created_at)
     VALUES (?, ?, ?, ?, 'new', ?) RETURNING *`
  );
  return stmt.get(
    input.source,
    input.message,
    input.contact ?? null,
    input.severity ?? 'question',
    now()
  ) as Feedback;
}

export function listFeedback(filters?: {
  status?: FeedbackStatus;
  source?: FeedbackSource;
  severity?: FeedbackSeverity;
}): Feedback[] {
  const db = getDb();
  const where: string[] = [];
  const vals: any[] = [];
  if (filters?.status) {
    where.push('status = ?');
    vals.push(filters.status);
  }
  if (filters?.source) {
    where.push('source = ?');
    vals.push(filters.source);
  }
  if (filters?.severity) {
    where.push('severity = ?');
    vals.push(filters.severity);
  }
  const sql =
    `SELECT * FROM feedback` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY created_at DESC`;
  return db.prepare(sql).all(...vals) as Feedback[];
}

export function getFeedback(id: number): Feedback | null {
  const db = getDb();
  return (db.prepare(`SELECT * FROM feedback WHERE id = ?`).get(id) as Feedback) || null;
}

export function updateFeedback(id: number, patch: Partial<Feedback>): Feedback | null {
  const db = getDb();
  const allowed: (keyof Feedback)[] = ['status', 'severity', 'message', 'contact', 'source'];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const k of allowed) {
    if (k in patch) {
      sets.push(`${k} = ?`);
      vals.push((patch as any)[k]);
    }
  }
  if (sets.length === 0) return getFeedback(id);
  vals.push(id);
  const stmt = db.prepare(`UPDATE feedback SET ${sets.join(', ')} WHERE id = ? RETURNING *`);
  return (stmt.get(...vals) as Feedback) || null;
}

// ---------- Installs ----------
export function insertInstall(input: {
  anonymous_id: string;
  version: string;
  os: string;
  python_version?: string;
  country?: string;
}): Install {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO installs (anonymous_id, version, os, python_version, country, created_at)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  );
  return stmt.get(
    input.anonymous_id,
    input.version,
    input.os,
    input.python_version ?? null,
    input.country ?? null,
    now()
  ) as Install;
}

export function listInstalls(limit = 100): Install[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM installs ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as Install[];
}

export function installsPerDay(days: number): { day: string; count: number }[] {
  const db = getDb();
  const since = now() - days * 24 * 60 * 60 * 1000;
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS count
       FROM installs WHERE created_at >= ? GROUP BY day ORDER BY day ASC`
    )
    .all(since) as { day: string; count: number }[];
  return rows;
}

// ---------- Queries ----------
export function insertQuery(input: {
  anonymous_id: string;
  repo_size_chunks: number;
  tokens_used: number;
  cost_usd: number;
  used_packs: number;
}): Query {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO queries (anonymous_id, repo_size_chunks, tokens_used, cost_usd, used_packs, created_at)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  );
  return stmt.get(
    input.anonymous_id,
    input.repo_size_chunks,
    input.tokens_used,
    input.cost_usd,
    input.used_packs,
    now()
  ) as Query;
}

export function queriesPerDay(days: number): { day: string; count: number }[] {
  const db = getDb();
  const since = now() - days * 24 * 60 * 60 * 1000;
  return db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS count
       FROM queries WHERE created_at >= ? GROUP BY day ORDER BY day ASC`
    )
    .all(since) as { day: string; count: number }[];
}

export function avgCostPerQuery(): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT AVG(cost_usd) AS avg FROM queries WHERE cost_usd IS NOT NULL`)
    .get() as { avg: number | null };
  return row?.avg ?? 0;
}

export function costPerDay(days: number): { date: string; avg_cost: number }[] {
  const db = getDb();
  const since = now() - days * 24 * 60 * 60 * 1000;
  return db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS date,
              AVG(cost_usd) AS avg_cost
       FROM queries
       WHERE created_at >= ? AND cost_usd IS NOT NULL
       GROUP BY date
       ORDER BY date ASC`
    )
    .all(since) as { date: string; avg_cost: number }[];
}

export function computeTokensSavedEstimate(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN used_packs = 1 THEN tokens_used * 1.5 ELSE 0 END), 0)
         - COALESCE(SUM(tokens_used), 0) AS saved
       FROM queries`
    )
    .get() as { saved: number } | undefined;
  return Math.max(0, Math.round(row?.saved ?? 0));
}

// ---------- Blog Posts ----------
export function insertBlogPost(input: {
  slug: string;
  title: string;
  body_md: string;
  status: BlogStatus;
}): BlogPost {
  const db = getDb();
  const published_at = input.status === 'published' ? now() : null;
  const stmt = db.prepare(
    `INSERT INTO blog_posts (slug, title, body_md, status, published_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  );
  return stmt.get(input.slug, input.title, input.body_md, input.status, published_at, now()) as BlogPost;
}

export function updateBlogPost(id: number, patch: Partial<BlogPost>): BlogPost | null {
  const db = getDb();
  const allowed: (keyof BlogPost)[] = ['slug', 'title', 'body_md', 'status', 'published_at'];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const k of allowed) {
    if (k in patch) {
      sets.push(`${k} = ?`);
      vals.push((patch as any)[k]);
    }
  }
  // Auto-set published_at when transitioning to published
  if (patch.status === 'published' && !('published_at' in patch)) {
    const existing = db.prepare(`SELECT published_at FROM blog_posts WHERE id = ?`).get(id) as
      | { published_at: number | null }
      | undefined;
    if (existing && !existing.published_at) {
      sets.push('published_at = ?');
      vals.push(now());
    }
  }
  if (sets.length === 0) return getBlogPostById(id);
  vals.push(id);
  const stmt = db.prepare(`UPDATE blog_posts SET ${sets.join(', ')} WHERE id = ? RETURNING *`);
  return (stmt.get(...vals) as BlogPost) || null;
}

export function getBlogPostById(id: number): BlogPost | null {
  const db = getDb();
  return (db.prepare(`SELECT * FROM blog_posts WHERE id = ?`).get(id) as BlogPost) || null;
}

export function listBlogPosts(status?: BlogStatus): BlogPost[] {
  const db = getDb();
  if (status) {
    return db
      .prepare(`SELECT * FROM blog_posts WHERE status = ? ORDER BY created_at DESC`)
      .all(status) as BlogPost[];
  }
  return db.prepare(`SELECT * FROM blog_posts ORDER BY created_at DESC`).all() as BlogPost[];
}

export function getBlogPostBySlug(slug: string): BlogPost | null {
  const db = getDb();
  return (db.prepare(`SELECT * FROM blog_posts WHERE slug = ?`).get(slug) as BlogPost) || null;
}

// ---------- KPIs ----------
export function getKpis(): {
  new_signups_24h: number;
  installs_7d: number;
  queries_24h: number;
  open_feedback: number;
  total_partners: number;
  avg_cost_query: number;
} {
  const db = getDb();
  const t = now();
  const day = 24 * 60 * 60 * 1000;
  const week = 7 * day;

  const new_signups_24h = (db
    .prepare(`SELECT COUNT(*) AS c FROM signups WHERE created_at >= ?`)
    .get(t - day) as { c: number }).c;

  const installs_7d = (db
    .prepare(
      `SELECT COUNT(DISTINCT anonymous_id) AS c FROM installs WHERE created_at >= ?`
    )
    .get(t - week) as { c: number }).c;

  const queries_24h = (db
    .prepare(`SELECT COUNT(*) AS c FROM queries WHERE created_at >= ?`)
    .get(t - day) as { c: number }).c;

  const open_feedback = (db
    .prepare(`SELECT COUNT(*) AS c FROM feedback WHERE status = 'new'`)
    .get() as { c: number }).c;

  const total_partners = (db
    .prepare(`SELECT COUNT(*) AS c FROM design_partners`)
    .get() as { c: number }).c;

  const avgRow = db
    .prepare(
      `SELECT AVG(cost_usd) AS a FROM queries WHERE created_at >= ? AND cost_usd IS NOT NULL`
    )
    .get(t - week) as { a: number | null };
  const avg_cost_query = avgRow?.a ?? 0;

  return {
    new_signups_24h,
    installs_7d,
    queries_24h,
    open_feedback,
    total_partners,
    avg_cost_query,
  };
}
