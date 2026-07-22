// Find which database on a Neon endpoint is the one the dashboard uses.
//
//   set "DATABASE_URL=postgresql://…"
//   node scripts/find-dashboard-db.mjs
//
// Connects to the endpoint in DATABASE_URL, enumerates every database on it,
// and reports which (if any) contains the dashboard's `signups` table. Purely
// read-only — it writes nothing.
//
// If none match, the dashboard lives on a DIFFERENT Neon branch or project:
// each branch has its own endpoint host (ep-<id>), so switch branch in the Neon
// console, copy that connection string, and run this again.
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';

function arg(name) {
  const argv = process.argv;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === `--${name}` || argv[i] === `-${name}`) return argv[i + 1] ?? null;
    const eq = argv[i].match(new RegExp(`^--?${name}=(.*)$`));
    if (eq) return eq[1] || null;
  }
  return null;
}

// Read from a dotenv file so the connection string never has to survive a
// shell. cmd splits on '&', which every Neon URL contains.
function fromEnvFile(key) {
  for (const f of [arg('env-file'), '.env.local', '.env.vercel.local'].filter(Boolean)) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (m) {
      const v = m[1].trim().replace(/^["']|["']$/g, '');
      if (v && !/ep-xxxx|REGION\.aws|DBNAME/.test(v) && !/^\[sensitive\]$/i.test(v)) return v;
    }
  }
  return null;
}

const url = arg('db') || process.env.DATABASE_URL || fromEnvFile('DATABASE_URL');
if (!url) {
  console.error('\n✗ No DATABASE_URL found in -db, the environment, or .env.local\n');
  process.exit(1);
}
if (!/^postgres(ql)?:\/\/[^/]+@/.test(url.trim())) {
  console.error(
    `\n✗ DATABASE_URL is not a valid Postgres URL (got ${url.trim().length} chars starting ${JSON.stringify(url.trim().slice(0, 13))}).` +
      '\n  Paste it into dashboard/.env.local as a DATABASE_URL=... line instead of using `set`.\n'
  );
  process.exit(1);
}

const MARKERS = ['signups', 'admin_users', 'social_posts'];
const host = (url.match(/@([^/?]+)/) || [])[1] || 'unknown';
const current = (url.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';

function urlFor(dbName) {
  // Swap only the path segment, preserving credentials and query params.
  return url.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

async function tablesIn(dbName) {
  const pool = new pg.Pool({
    connectionString: urlFor(dbName),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  try {
    const r = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
    );
    return r.rows.map((x) => x.table_name);
  } finally {
    await pool.end().catch(() => {});
  }
}

console.log(`\nendpoint : ${host}`);
console.log(`connected to database : ${current}\n`);

const admin = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});

let names = [];
try {
  const r = await admin.query(
    `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`
  );
  names = r.rows.map((x) => x.datname);
} catch (e) {
  console.error(`✗ Could not list databases: ${e.message}`);
  process.exit(1);
} finally {
  await admin.end().catch(() => {});
}

let found = null;
for (const n of names) {
  let verdict;
  try {
    const t = await tablesIn(n);
    const hits = MARKERS.filter((m) => t.includes(m));
    if (hits.length === MARKERS.length) {
      verdict = `*** MATCH — this is the dashboard database (${t.length} tables)`;
      found = n;
    } else if (hits.length) {
      verdict = `partial: ${hits.join(', ')} (${t.length} tables)`;
    } else {
      verdict = t.length ? `no marker tables (${t.length} tables)` : 'empty';
    }
  } catch (e) {
    verdict = `unreadable: ${e.message.slice(0, 60)}`;
  }
  console.log(`  ${n.padEnd(24)} ${verdict}`);
}

if (found) {
  console.log(`\n✓ Use the database "${found}" on this endpoint.`);
  console.log('  Set DATABASE_URL with that database name, then run:');
  console.log('    node scripts/set-admin-password.mjs -generate -email you@example.com');
} else {
  console.log('\n✗ No database on this endpoint has the dashboard schema.');
  console.log('  The dashboard is on a different Neon BRANCH or PROJECT — each branch');
  console.log('  has its own ep-<id> host. In the Neon console switch branch, copy that');
  console.log('  connection string, and run this again.');
}
