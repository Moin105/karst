# Social studio

AI-written social posts for **X, Reddit, Discord, Instagram**, generated, reviewed,
and published entirely from the admin dashboard. No external automation server —
generation (Claude) and publishing (platform APIs) run as dashboard API routes,
so it works on the live Vercel deployment.

```
/social  ── Generate ─▶ Claude writes a post per platform ─▶ drafts in the queue
              │
        review / edit / Approve
              │
           Publish now ─▶ posts to X / Reddit / Discord / Instagram ─▶ status updates
```

Everything is on-demand (you click Generate / Publish). Nothing posts automatically.

## How it works

- **Generate** (`/social`) → `POST /api/social/trigger {action:'generate'}` →
  `lib/social/generate.ts` calls the configured provider once per selected platform (in parallel),
  parses the JSON, and inserts each as a **draft**. The button reports how many
  drafts were created (and how many platforms failed).
- **Publish now** (`/social/[id]`, enabled once **Approved**) →
  `POST /api/social/trigger {action:'publish'}` → `lib/social/publish.ts` posts to
  that platform's API and flips the post to **posted** (with the live link) or
  **failed** (with the error). Both routes require an admin session.
- **Handles** (`/social/accounts`) holds non-secret routing (e.g. the Reddit
  subreddit). All API secrets live in env vars, never in the database.

## Setup (dashboard env vars)

Add these in your Vercel project (and `.env.local` for dev). Set only what you use.

**Generation — set _one_ of these keys:**
| Var | What |
|-----|------|
| `GEMINI_API_KEY` | A Google AI Studio key. The **free tier covers this workload** — the posts are short and structured. Default model `gemini-2.0-flash`. |
| `ANTHROPIC_API_KEY` | An Anthropic key. Default model `claude-sonnet-4-6`. |
| `KARST_SOCIAL_PROVIDER` | optional; `gemini` or `anthropic`. Forces one when both keys are set. Otherwise Anthropic wins if present, else Gemini. |
| `KARST_SOCIAL_MODEL` | optional; overrides the default model for whichever provider is active. |

With neither key set, Generate fails with `no model key set — set GEMINI_API_KEY
or ANTHROPIC_API_KEY`.

> **A ChatGPT Plus/Pro subscription does not work here.** That subscription only
> covers chatgpt.com; programmatic access is the separate, separately-billed
> OpenAI API. There is no way to drive this (or any script) from a Plus plan.

**Publishing (per channel — unset = "not configured", post by hand):**
| Channel | Env | Notes |
|---------|-----|-------|
| **Discord** | `DISCORD_WEBHOOK_URL` | Channel → Edit → Integrations → Webhooks. Works immediately. |
| **Reddit** | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` | Create a **script** app at reddit.com/prefs/apps. Set the **Target** subreddit on the Handles page. |
| **X** | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | X dev portal → your app → Keys & tokens. OAuth 1.0a user context. Free tier posts with a low monthly cap. |
| **Instagram** | `IG_USER_ID`, `IG_ACCESS_TOKEN` | Business/Creator account via the Graph API. The post's **Image asset** must be a public image URL. |

**Optional:** `KARST_SOCIAL_INGEST_TOKEN` enables `POST /api/ingest/social`, a
token-gated webhook to inject drafts from outside (Zapier, a cron, etc). Off when unset.

## Prefer n8n? (optional)

If you'd rather drive this with n8n's visual workflows instead of the built-in
engine, set `KARST_N8N_BASE_URL` and the dashboard's buttons forward to n8n
instead. For a hosted dashboard that URL must be public (a free Cloudflare Tunnel
to your local n8n). Full setup + importable workflows live in
[`integrations/n8n/README.md`](../integrations/n8n/README.md). Unset = built-in engine.

## Cost

Effectively the price of a few model calls — pennies a month at this volume, and
**$0 on Gemini's free tier**, which is the recommended setup. Discord/Reddit/
Instagram APIs are free; X is free at low volume.
