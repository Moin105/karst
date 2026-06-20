import {
  getDb,
  insertSignup,
  insertPartner,
  insertFeedback,
  insertInstall,
  insertQuery,
  insertBlogPost,
} from './db';

function randomId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const db = getDb();
  const now = Date.now();

  // Signups
  const signups = [
    { email: 'alice@acme.io', source: 'landing', notes: 'Found us via HN' },
    { email: 'bob@fintech.dev', source: 'twitter', notes: 'Replied to launch tweet' },
    { email: 'carla@healthtech.co', source: 'referral', notes: 'Referred by a friend' },
  ];
  for (const s of signups) {
    try {
      insertSignup(s);
    } catch (e) {
      /* ignore duplicates */
    }
  }

  // Partners
  insertPartner({
    name: 'Bob Marshall',
    email: 'bob@fintech.dev',
    company: 'FinTech Dev',
    vertical: 'fintech',
    status: 'lead',
    notes_md: `# Fintech lead\n\n- Interested in **MCP integration**\n- Wants demo next week\n- Budget: $5k/mo`,
  });

  insertPartner({
    name: 'Carla Reyes',
    email: 'carla@healthtech.co',
    company: 'HealthTech Co',
    vertical: 'healthtech',
    status: 'piloting',
    notes_md: `# Healthtech pilot\n\n- 2 week trial in progress\n- Engineering team of 12\n- HIPAA constraints discussed`,
  });

  // Feedback
  insertFeedback({
    source: 'cli',
    message: 'CLI hangs when indexing very large repos (>1M LOC). Repro: run karst index on chromium.',
    contact: 'user1@example.com',
    severity: 'bug',
  });

  insertFeedback({
    source: 'mcp',
    message: 'Could we get a pack for terraform modules? Would unlock IaC workflows.',
    contact: 'devops@bigco.com',
    severity: 'idea',
  });

  // Installs scattered over last 7 days
  const installStmt = db.prepare(
    `INSERT INTO installs (anonymous_id, version, os, python_version, country, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const oses = ['macos', 'linux', 'windows'];
  const countries = ['US', 'GB', 'DE', 'IN', 'CA'];
  for (let i = 0; i < 5; i++) {
    const daysAgo = Math.random() * 7;
    const ts = now - Math.floor(daysAgo * 24 * 60 * 60 * 1000);
    installStmt.run(
      randomId(),
      '0.1.0',
      randomChoice(oses),
      '3.11.4',
      randomChoice(countries),
      ts
    );
  }

  // Queries scattered last 24h
  const queryStmt = db.prepare(
    `INSERT INTO queries (anonymous_id, repo_size_chunks, tokens_used, cost_usd, used_packs, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < 12; i++) {
    const hoursAgo = Math.random() * 24;
    const ts = now - Math.floor(hoursAgo * 60 * 60 * 1000);
    const cost = 0.01 + Math.random() * 0.04;
    queryStmt.run(
      randomId(),
      Math.floor(500 + Math.random() * 5000),
      Math.floor(2000 + Math.random() * 20000),
      Number(cost.toFixed(4)),
      Math.random() > 0.5 ? 1 : 0,
      ts
    );
  }

  // Blog posts
  try {
    insertBlogPost({
      slug: 'why-karst',
      title: 'Why we built Karst',
      body_md: `# Why we built Karst\n\nMost LLM tools waste tokens. We don't.\n\n## The problem\n\nIndexing entire codebases blows up token budgets.\n\n## Our approach\n\nSmart chunking + caching + packs.`,
      status: 'published',
    });
  } catch (e) {
    /* ignore */
  }
  try {
    insertBlogPost({
      slug: 'roadmap-2026',
      title: 'Roadmap 2026 (draft)',
      body_md: `# 2026 roadmap\n\n- MCP server\n- Terraform pack\n- VS Code extension\n- Self-hosted option`,
      status: 'draft',
    });
  } catch (e) {
    /* ignore */
  }

  // Summary
  const tables = ['signups', 'design_partners', 'feedback', 'installs', 'queries', 'blog_posts'];
  const summary: Record<string, number> = {};
  for (const t of tables) {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number };
    summary[t] = row.c;
  }
  console.log('Seed complete:');
  console.table(summary);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
