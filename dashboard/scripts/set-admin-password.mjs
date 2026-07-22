// Set the admin password directly in the database — the reliable recovery path
// when you are locked out of the panel.
//
//   node scripts/set-admin-password.mjs --email you@example.com --password "..."
//   npm run admin:password -- --email you@example.com --password "..."
//
// Why this exists: the email reset flow needs SMTP configured AND the typed
// address to match KARST_ADMIN_EMAIL exactly, and it deliberately reports
// "sent" either way — so a misconfiguration is invisible. Worse,
// authenticatePassword() prefers the admin_users.password_hash row over
// KARST_ADMIN_PASSWORD_HASH, so once a row exists the env var is dead and
// changing it in Vercel does nothing.
//
// This writes that winning row directly, then verifies it. No SMTP, no
// redeploy, no env precedence to reason about.
//
// DATABASE_URL comes from the environment (--env-file=.env.local) or --db.
// Use the SAME value Vercel uses, or you will update a database the deployed
// app never reads.
import pg from 'pg';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const N = 16384;
const KEYLEN = 64;

// Accepts `--name value`, `-name value` and `--name=value`. Windows shells and
// copy-paste routinely collapse `--` to `-`, and silently ignoring the flag is
// far more confusing than accepting both.
function arg(name) {
  const argv = process.argv;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}` || a === `-${name}`) return argv[i + 1] ?? null;
    const eq = a.match(new RegExp(`^--?${name}=(.*)$`));
    if (eq) return eq[1] || null;
  }
  return null;
}

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

// Pull DATABASE_URL / KARST_ADMIN_EMAIL out of a dotenv file without printing
// it. Lets you run this straight after `vercel env pull` with no secret on the
// command line (and therefore none in shell history).
function fromEnvFile(key) {
  for (const f of [arg('env-file'), '.env.vercel.local', '.env.local'].filter(Boolean)) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (m) {
      const v = m[1].trim().replace(/^["']|["']$/g, '');
      // Skip placeholders and Vercel's redaction marker so we fall through to
      // the next file rather than failing on a value that was never real.
      if (v && !/ep-xxxx|REGION\.aws|DBNAME/.test(v) && !/^\[sensitive\]$/i.test(v)) return v;
    }
  }
  return null;
}

// Tolerate `--generate`, `--generate=true` and `-g`; npm's `--` forwarding is
// unreliable on Windows, so this is easy to lose in transit.
const generate = process.argv.some((a) => /^(--?generate(=true)?|-g)$/.test(a));

/** Flag names only — values may contain the DB password, so never echo them. */
function flagsSeen() {
  const f = process.argv.slice(2).filter((a) => a.startsWith('-')).map((a) => a.split('=')[0]);
  return f.length ? f.join(' ') : '(none)';
}
const outFile = arg('out') || '.env.admin.local';

const email = (arg('email') || process.env.KARST_ADMIN_EMAIL || fromEnvFile('KARST_ADMIN_EMAIL') || '')
  .trim()
  .toLowerCase();
// 18 random bytes ≈ 144 bits — not guessable, and never typed by a human.
const password = generate ? randomBytes(18).toString('base64url') : arg('password');
const dbUrl = arg('db') || process.env.DATABASE_URL || fromEnvFile('DATABASE_URL');

if (!email) die('No email. Pass --email, or set KARST_ADMIN_EMAIL.');
if (!password) {
  die(
    'No password. Pass --password "your password", or --generate.\n' +
      `  Flags this script actually received: ${flagsSeen()}\n` +
      '  If --generate is missing above, npm ate it — call node directly instead:\n' +
      '    node scripts/set-admin-password.mjs --generate --email you@example.com --db "postgresql://…"'
  );
}
if (password.length < 8) die('Password must be at least 8 characters (the reset form enforces this too).');
if (!dbUrl) die('No DATABASE_URL. Pass --db "postgresql://…", or use --env-file=.env.local.');
if (/ep-xxxx|REGION\.aws|<.*>/i.test(dbUrl)) {
  die('DATABASE_URL is still a placeholder. Get the real connection string from the Neon console.');
}
// `vercel env pull` writes this literal for vars marked Sensitive — they are
// write-only in Vercel and cannot be read back by the CLI or the UI.
if (/^\[sensitive\]$/i.test(dbUrl.trim())) {
  die(
    'DATABASE_URL came back as "[sensitive]" — Vercel redacts Sensitive vars on pull.\n' +
      '  Get the connection string from the Neon console instead (Connect → pooled),\n' +
      '  and pass it with --db "postgresql://…".'
  );
}

// Mirrors lib/auth.ts hashPassword(): scrypt N=16384, r=8, p=1, keylen=64,
// ':'-delimited so dotenv never tries to expand a '$'.
function hashPassword(plain) {
  const salt = randomBytes(16);
  const h = scryptSync(plain, salt, KEYLEN, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt:N=${N}:${salt.toString('hex')}:${h.toString('hex')}`;
}

function verifyPassword(plain, encoded) {
  const parts = String(encoded).split(':');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const n = parseInt((parts[1].match(/^N=(\d+)$/) || [])[1], 10);
  if (!Number.isFinite(n)) return false;
  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');
  const actual = scryptSync(plain, salt, expected.length, { N: n, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Validate the shape before pg tries to resolve a nonsense hostname. Shell
// mangling (cmd splitting on '&', stray quotes, a half-pasted string) shows up
// here as a confusing DNS error, so say what actually arrived — structure only,
// never the credentials.
if (!/^postgres(ql)?:\/\/[^/]+@/.test(dbUrl.trim())) {
  const v = dbUrl.trim();
  die(
    'DATABASE_URL is not a valid Postgres URL.\n' +
      `  length            : ${v.length}\n` +
      `  starts with       : ${JSON.stringify(v.slice(0, 13))}\n` +
      `  contains "@"      : ${v.includes('@')}\n` +
      `  contains a space  : ${/\s/.test(v)}\n` +
      `  contains a quote  : ${/["']/.test(v)}\n` +
      '  Expected: postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require\n\n' +
      '  If it looks truncated, cmd split it at the "&". Do not use `set` —\n' +
      '  paste the string into dashboard/.env.local as a DATABASE_URL=... line\n' +
      '  and run this script with no -db flag.'
  );
}

// Same rule lib/db.ts uses: local Postgres is plaintext, hosted needs TLS.
const isLocal = /@(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)(:|\/)/.test(dbUrl);
const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});

try {
  const host = (dbUrl.match(/@([^/?]+)/) || [])[1] || 'unknown';
  const dbName = (dbUrl.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';
  console.log(`\nhost     : ${host}`);
  console.log(`database : ${dbName}`);
  console.log(`email    : ${email}`);

  // Check FIRST, create nothing yet. `signups` is created by the dashboard's
  // SCHEMA_SQL and by nothing else, so its absence means this is very likely
  // the wrong Neon branch/database — and bailing must leave that database
  // exactly as we found it.
  const probe = await pool.query(`SELECT to_regclass('public.signups') IS NOT NULL AS present`);
  if (!probe.rows[0]?.present) {
    die(
      'This database has no "signups" table, so it is probably NOT the one the\n' +
        '  dashboard uses. Check the branch and database in the Neon console against\n' +
        `  https://upgraded-garbanzo-x2e8.vercel.app/api/health (it reports schema_ready).\n` +
        '  Refusing to write an admin row into the wrong database. Nothing was changed.'
    );
  }

  // Only now, on a confirmed dashboard database, ensure the table exists — the
  // app creates it lazily, so it may be absent if no request has hit this
  // database yet. Matches SCHEMA_SQL in lib/db.ts exactly.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      created_at BIGINT
    );
  `);
  await pool.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS session_epoch BIGINT;`);

  const before = await pool.query(
    `SELECT email, (password_hash IS NOT NULL) AS has_hash FROM admin_users`
  );
  console.log(`\nexisting admin rows: ${before.rowCount}`);
  for (const r of before.rows) console.log(`  ${r.email}  has_password_hash=${r.has_hash}`);

  const ts = Date.now();
  // Bumping session_epoch invalidates any sessions minted before this change,
  // exactly like setAdminPasswordHash() does.
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, session_epoch, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash,
                                       session_epoch = excluded.session_epoch`,
    [email, hashPassword(password), ts, ts]
  );

  // Read back and prove the new password actually authenticates, so a silent
  // write to the wrong database can't masquerade as success.
  const after = await pool.query(
    `SELECT password_hash FROM admin_users WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );
  const stored = after.rows[0]?.password_hash;
  if (!stored) die('Wrote the row but could not read it back — check you are on the right database.');
  if (!verifyPassword(password, stored)) die('Stored hash does not verify. Nothing else changed; try again.');

  console.log('\n✓ Password set and verified against the stored hash.');

  if (generate) {
    // Written to a file, never stdout — so it stays out of terminal scrollback,
    // shell history and CI logs. '.env.*.local' is already gitignored.
    writeFileSync(
      outFile,
      `# karst admin login — move this into your password manager, then delete this file.\n` +
        `KARST_ADMIN_EMAIL=${email}\n` +
        `KARST_ADMIN_PASSWORD=${password}\n`,
      { mode: 0o600 }
    );
    console.log(`\n  Password written to ${outFile} (not printed here).`);
    console.log('  Open it, save the password in your password manager, then delete the file.');
  }

  console.log('\nNext:');
  console.log(`  1. Log in at /login with  ${email}  and the password you just set.`);
  console.log('  2. KARST_ADMIN_EMAIL in Vercel must equal that address, or login is rejected');
  console.log('     before the password is even checked.');
  console.log('  3. No redeploy needed — this value lives in the database, not the env.');
} catch (e) {
  die(`${e.message}`);
} finally {
  await pool.end();
}
