import {
  getClient,
  insertSignup,
  insertPartner,
  insertFeedback,
  insertBlogPost,
} from './db';

function randomId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const db = await getClient();
  const now = Date.now();

  // Signups
  const signups = [
    { email: 'alice@acme.io', source: 'landing', notes: 'Found us via HN' },
    { email: 'bob@fintech.dev', source: 'twitter', notes: 'Replied to launch tweet' },
    { email: 'carla@healthtech.co', source: 'referral', notes: 'Referred by a friend' },
  ];
  for (const s of signups) {
    try {
      await insertSignup(s);
    } catch {
      /* ignore duplicates */
    }
  }

  // Partners
  await insertPartner({
    name: 'Bob Marshall',
    email: 'bob@fintech.dev',
    company: 'FinTech Dev',
    vertical: 'fintech',
    status: 'lead',
    notes_md: `# Fintech lead\n\n- Interested in **MCP integration**\n- Wants demo next week\n- Budget: $5k/mo`,
  });

  await insertPartner({
    name: 'Carla Reyes',
    email: 'carla@healthtech.co',
    company: 'HealthTech Co',
    vertical: 'healthtech',
    status: 'piloting',
    notes_md: `# Healthtech pilot\n\n- 2 week trial in progress\n- Engineering team of 12\n- HIPAA constraints discussed`,
  });

  // Feedback
  await insertFeedback({
    source: 'cli',
    message: 'CLI hangs when indexing very large repos (>1M LOC). Repro: run karst index on chromium.',
    contact: 'user1@example.com',
    severity: 'bug',
  });

  await insertFeedback({
    source: 'mcp',
    message: 'Could we get a pack for terraform modules? Would unlock IaC workflows.',
    contact: 'devops@bigco.com',
    severity: 'idea',
  });

  // Installs scattered over last 7 days
  const oses = ['macos', 'linux', 'windows'];
  const countries = ['US', 'GB', 'DE', 'IN', 'CA'];
  for (let i = 0; i < 5; i++) {
    const ts = now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000);
    await db.execute({
      sql: `INSERT INTO installs (anonymous_id, version, os, python_version, country, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [randomId(), '0.1.0', randomChoice(oses), '3.11.4', randomChoice(countries), ts],
    });
  }

  // Queries scattered last 24h
  for (let i = 0; i < 12; i++) {
    const ts = now - Math.floor(Math.random() * 24 * 60 * 60 * 1000);
    const cost = Number((0.01 + Math.random() * 0.04).toFixed(4));
    await db.execute({
      sql: `INSERT INTO queries (anonymous_id, repo_size_chunks, tokens_used, cost_usd, used_packs, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        randomId(),
        Math.floor(500 + Math.random() * 5000),
        Math.floor(2000 + Math.random() * 20000),
        cost,
        Math.random() > 0.5 ? 1 : 0,
        ts,
      ],
    });
  }

  // Blog posts
  try {
    await insertBlogPost({
      slug: 'why-karst',
      title: 'Why we built karst',
      body_md: `# Why we built karst\n\nMost LLM tools waste tokens. We don't.\n\n## The problem\n\nIndexing entire codebases blows up token budgets.\n\n## Our approach\n\nSmart chunking + caching + packs.`,
      status: 'published',
    });
  } catch {
    /* ignore */
  }
  try {
    await insertBlogPost({
      slug: 'roadmap-2026',
      title: 'Roadmap 2026 (draft)',
      body_md: `# 2026 roadmap\n\n- MCP server\n- Terraform pack\n- VS Code extension\n- Self-hosted option`,
      status: 'draft',
    });
  } catch {
    /* ignore */
  }

  // Summary
  const tables = ['signups', 'design_partners', 'feedback', 'installs', 'queries', 'blog_posts'];
  const summary: Record<string, number> = {};
  for (const t of tables) {
    const r = await db.execute(`SELECT COUNT(*) AS c FROM ${t}`);
    summary[t] = (r.rows[0] as unknown as { c: number }).c;
  }
  console.log('Seed complete:');
  console.table(summary);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
