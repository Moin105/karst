import { getClient } from './db';

// One-shot schema migration. Run this once against a fresh database (e.g. your
// Neon instance) BEFORE the app serves traffic:
//
//   DATABASE_URL=postgres://... npm run db:migrate
//
// getClient() runs the CREATE TABLE/INDEX IF NOT EXISTS batch. Doing it here
// once means the runtime bootstrap in db.ts is a no-op on every cold start,
// avoiding concurrent-DDL races across serverless instances.
async function main() {
  await getClient();
  console.log('Migration complete — schema is up to date.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
