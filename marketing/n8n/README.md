# karst — social pipeline (n8n + dashboard)

On-demand, AI-written social posts for **X, Reddit, Discord, Instagram**, reviewed
and published from your **admin dashboard**. Generation and publishing run in
**n8n** (free, self-hosted); the dashboard owns the review queue.

```
Dashboard "Generate" ──▶ /api/social/trigger ──▶ n8n (generate) ──▶ Claude
        ▲                                                              │
        │  drafts appear in the queue  ◀── /api/ingest/social ◀────────┘
        │
   you review / edit / Approve
        │
Dashboard "Publish now" ─▶ /api/social/trigger ─▶ n8n (publish) ─▶ X/Reddit/Discord/IG
                                                        │
   status flips to posted/failed ◀── /api/ingest/social/status ◀───────┘
```

Nothing is auto-scheduled — you click **Generate** (optionally with a theme) and
**Publish** yourself. Secrets (API keys, webhook URLs, OAuth tokens) live only in
n8n credentials, never in the dashboard or these files.

---

## 1. Dashboard env vars

Set these where the dashboard runs (`.env.local` for local dev, Vercel project
env for prod), then restart it:

| Var | Required | Default | What |
|-----|----------|---------|------|
| `KARST_SOCIAL_INGEST_TOKEN` | **yes** | — | Shared secret n8n uses to push drafts / status. Generate one: `openssl rand -hex 24`. Until it's set, the social ingest endpoints return `503` (fail closed). |
| `KARST_N8N_BASE_URL` | no | `http://localhost:5678` | Where the dashboard reaches n8n. Localhost is correct when you run the dashboard on the same machine as n8n. |
| `KARST_N8N_GENERATE_PATH` | no | `/webhook/karst-social-generate` | n8n production webhook path. |
| `KARST_N8N_PUBLISH_PATH` | no | `/webhook/karst-social-publish` | n8n production webhook path. |

> **Hosted dashboard + local n8n:** a Vercel (https) dashboard can't reach
> `http://localhost:5678`. Either (a) run the dashboard locally for social ops, or
> (b) expose n8n over https with a tunnel (`n8n start --tunnel`, or ngrok) and set
> `KARST_N8N_BASE_URL` to that https URL.

## 2. Import the workflows

In n8n: **Workflows → Import from File** for each:
- `karst-social-generate.json`
- `karst-social-publish.json`

Open **Build jobs** (generate) and **Config** (publish) and edit the one marked
constant `DASHBOARD_URL` to your dashboard origin (e.g. `http://localhost:3001`).

## 3. Credentials to attach

Create these in n8n (**Credentials → New**) and select them on the matching nodes:

| Node | Credential | How |
|------|-----------|-----|
| **Claude (Anthropic)** | *Header Auth* | Name `x-api-key`, Value = your Anthropic API key. |
| **Post draft to dashboard**, **Callback: posted/failed** | *Header Auth* | Name `Authorization`, Value `Bearer <KARST_SOCIAL_INGEST_TOKEN>` (same token as step 1). |
| **Discord webhook** | none | Paste your channel's webhook URL into the node's **URL** field (Channel → Edit → Integrations → Webhooks). |
| **X / Twitter post** | *Twitter OAuth2 API* | Create an app at developer.x.com, OAuth2 with `tweet.write tweet.read users.read offline.access`. |
| **Reddit submit** | *Reddit OAuth2 API* | Create a "script"/"web" app at reddit.com/prefs/apps; scopes include `submit identity`. Set the **Target** (subreddit) per post in the dashboard handles page. |
| **Instagram media** | *Facebook Graph API* | Needs an IG **Business/Creator** account linked to a FB Page + a Meta app with `instagram_content_publish`. Requires a public **image URL** (the post's "Image asset" field). |

## 4. Activate + verify

1. Toggle both workflows **Active** (production webhooks only fire when active).
2. In the dashboard: **Social → Handles & accounts**, fill in your handles and the
   Reddit **Target** subreddit.
3. **Social → Generate drafts** → pick platforms → Generate. Drafts appear in the
   queue within a few seconds.
4. Open a draft → edit if needed → **Approve** → **Publish now**. Status flips to
   **posted** (with a live link) or **failed** (with the error).

---

## Per-platform reality (free, no paid plan)

| Platform | Auto-publish | Notes |
|----------|--------------|-------|
| **Discord** | ✅ works immediately | Webhook URL only, no OAuth. The most reliable channel. |
| **Reddit** | ✅ free API | OAuth app is free. Mind subreddit self-promo rules + rate limits. |
| **X** | ⚠️ free tier | The free X API allows writing posts but with **low monthly caps**; heavy posting needs a paid tier. The node works once OAuth2 is set. |
| **Instagram** | ⚠️ business only | Graph API requires a Business/Creator account + a hosted image. If you don't have that set up, leave IG drafts as **review-only** and post them by hand from the dashboard text. |

If a platform isn't set up yet, just don't Approve/Publish its drafts — the
generated text still sits in the queue for you to copy and post manually. The
review flow degrades gracefully to "copy & paste" for any channel.

## Regenerating these files

Both JSONs are generated from `_build.mjs` (so multi-line Code nodes stay valid):

```bash
node _build.mjs
```
