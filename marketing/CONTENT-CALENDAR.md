# karst — content calendar (X + Instagram)

Companion to [`social/README.md`](social/README.md) (the asset kit) and
[`VIDEO-SCRIPTS.md`](VIDEO-SCRIPTS.md) (the five video scripts). This file is the
**copy** — what to actually say, in what order.

**Accounts:** X [@KARST_CO](https://x.com/KARST_CO) · Instagram
[@karst.ai](https://www.instagram.com/karst.ai) · Discord (server
`1529358503771111454`). Reddit and Hacker News come later — see "Not yet".

**Links go to** the live landing page, `github.com/Moin105/karst`, or
`pypi.org/project/karst/`. Use a bare `karst.dev` link **only** after the domain
is attached (see below) — right now it serves an empty Cloudflare placeholder.

---

## Fix the profiles before posting anything

Three things are leaking value on every post that already went out.

**1. `karst.dev` is parked while the real site runs on a random slug.**
The landing page is **live and good** at `upgraded-garbanzo-roan.vercel.app` —
"know what your change breaks", Add-to-Cursor button, the three stat tiles, guides,
teams. But `karst.dev` resolves to Cloudflare's "nothing to be seen here" page.
Nothing needs rebuilding: **attach `karst.dev` to the existing Vercel project**
(Settings → Domains → Add), then repoint the Cloudflare A records to Vercel's
values, **grey-cloud / DNS-only** so cert issuance doesn't fight the proxy.
Ten minutes, and it is the highest-leverage item on this page.

**2. The X bio link is `upgraded-garbanzo-roan.vercel.app`.**
That is the single clickable link on the profile and it reads like a staging URL.
Swap to `karst.dev` the moment the domain is attached.

**3. The X bio undersells.** Current:
> karst is a librarian for your codebase that AI tools can talk to.

"Librarian" is a retrieval metaphor — it describes the commodity half of the
product and skips the differentiator entirely. Your own landing page already has
the better line. Suggested replacement (149 chars):

> Know what your change breaks — before you make it. Local call-graph + cited
> code context for Claude, Cursor & any MCP agent. Apache-2.0. Nothing leaves
> your machine.

**Instagram bio** (150-char limit):

> Local code context for AI coding agents 🔒 Blast-radius analysis over MCP
> Apache-2.0 · your code never leaves your machine
> ↓ install free

**Discord:** the link you sent is a *channel* URL — it only works for people
already in the server. Generate an invite (Server → Invite People → Edit link →
never expire, unlimited uses) and use that `discord.gg/...` everywhere instead.

---

## The proof, captured

All numbers below are **real output**, captured by running karst on its own repo
(135 files). Reproduce any of them before posting — stale numbers are worse than
no numbers.

```bash
python -m karst graph-index .
python -m karst impact --target Chunk \
  --graph-path ~/.karst/indexes/codercheck/graph.pkl --limit 15
```

**`graph-index` on karst itself:**
```
Built graph: 1001 nodes, 2718 edges from 135 files / 739 chunks in 6.4s
Edges by kind:
  calls      1373
  contains    739
  imports     604
  implements    2
```

**`impact --target Chunk`:**
```
Targets (2):
  - karst/models.py::Chunk
Affected: 52  Risk: CRITICAL

  [function ]  depth 1  score 1.150  via calls     karst/chunker.py::_emit_chunk        (karst/chunker.py:119-164)
  [function ]  depth 1  score 1.150  via calls     karst/store.py::_chunk_from_payload  (karst/store.py:337-355)
  [file     ]  depth 1  score 0.690  via contains  karst/models.py                      (karst/models.py)
  [function ]  depth 2  score 0.575  via calls     karst/graph/graphrag.py::_fetch_chunks_by_id  (karst/graph/graphrag.py:130-153)
  [method   ]  depth 2  score 0.500  via calls     karst/store.py::ChunkStore.search    (karst/store.py:187-249)
  [function ]  depth 3  score 0.383  via calls     karst/mcp_server.py::search_code     (karst/mcp_server.py:173-226)
```

> **Before screenshotting:** pipe through `1>out.txt 2>&1` or capture in a real
> UTF-8 terminal. The `Affected:`/`… and N more.` lines go to **stderr** and the
> rows to **stdout**, so a naive pipe interleaves them out of order
> (`karst/graph_cli.py:186`). Worth fixing — this is the hero screenshot.

**From the README (independent repo, 246-file NestJS + Next.js):** 906 chunks
indexed · re-index 343s → 2.3s incremental · ~$0.019 per question on Sonnet 4.6 ·
60% fewer tokens with packs attached.

**From v0.2.9 (`ask` cost meter):**
```
1,840 in + 612 out tok | $0.0276 + $0.0459 = $0.0735 (anthropic:claude-opus-4-8)
```

---

## Voice

Write like a developer showing another developer something, not like a product.

- **Lead with output, not adjectives.** A pasted terminal block beats any sentence.
- **Numbers must be real and reproducible.** Every claim above has a command.
- **Name the limitation.** "name-only resolution, so it over-matches on common
  names" earns more trust than silence. Devs assume you're hiding it anyway.
- **No emoji strings, no "🚀 excited to announce", no thread-bait** ("a 🧵 you
  can't miss"). One emoji max, and only if it's doing work.
- **Never write `#karst`.** It's a geology tag — limestone caves and sinkholes.
  Use `#mcp` `#cursor` `#claudecode` `#devtools` `#python`.
- Say "karst (MCP code context)" on cold-audience posts. The name carries no
  category signal on its own.

---

## The actual bottleneck: distribution, not content

@KARST_CO has **14 posts and 1 follower.** That number is the whole strategy.

Fourteen posts is not a content problem — it's proof that posting into an empty
graph does nothing. X gives a new account with no followers essentially zero
organic reach; the timeline is not a distribution channel until somebody follows
you. Writing post #15 changes nothing.

**The only way out of a cold start is other people's audiences.** For the next
three weeks the ratio should be roughly **10 replies : 1 post**. Replies are
where reach actually lives:

- Follow and reply to people building MCP servers, Cursor/Claude Code power
  users, and the local-LLM crowd. Aim for **5–10 substantive replies a day**.
- Substantive means answering the technical question, in public, whether or not
  karst is relevant. Mention the tool in maybe one reply in ten.
- Quote-post other people's demos with a genuine technical observation. Their
  audience sees it; yours doesn't have to exist yet.
- The recurring question *"how do I give my agent codebase context?"* is asked
  constantly. Every instance is a warm lead. Answer it properly and link nothing.

The posts below are what you publish **alongside** that reply habit — one a day,
maximum. They're the thing people find when a good reply makes them click your
profile. That's their job: not reach, but conversion once someone looks.

## Week 1 — build in public, sell nothing

No install links, no CTA. You are buying the right to post later. If someone asks
what it is, answer in the replies — that's the CTA.

**D1 — the dogfood post.** *Asset: screenshot of the `graph-index` block above.*
> Built the call/import graph for my own project this morning.
>
> 1,001 nodes, 2,718 edges, 135 files — 6.4s.
>
> 1,373 of those edges are CALLS. That's the part grep can't give you: not "where
> is this string", but "what actually depends on this".

**D2 — the problem, no product.**
> Semantic code search finds code that *looks like* your query.
>
> It does not find code that *breaks when you change* your query's target.
>
> Those are different graphs, and most "chat with your repo" tools only build the
> first one.

**D3 — a real engineering detail.** *Ties to the segfault fix in your history.*
> Fixed a segfault indexing large files today: tree-sitter's `children` builds
> the whole list, `child(i)` is O(1).
>
> On a 12k-line file that's the difference between a crash and 40ms.
>
> Parsers are full of these.

**D4 — the blast radius screenshot.** *Asset: the `impact --target Chunk` block.*
> Asked my own tool what breaks if I change one model class.
>
> 52 affected nodes. Risk: CRITICAL.
>
> Every row has a depth, the edge kind it travelled, and an exact file:line. I
> can verify all 52 by hand — which is the whole point.

**D5 — limitation, stated plainly.**
> Honest limitation: CALLS edges resolve by name, not by type. `save()` on two
> unrelated classes collapses into one node.
>
> It over-reports rather than under-reports — which for "what might break" is the
> failure direction I want. Still, it's the next thing to fix.

**IG this week:** post `20-hero-1x1` as the avatar, then `anim-blast-radius.gif`
→ MP4 as your first Reel with the D4 caption trimmed to two lines. That's it.

---

## Week 2 — start showing the product

**D6 — the local angle.** *Asset: `11-feature-local-16x9`.*
> karst never calls an LLM. It indexes, builds the graph, and retrieves — all
> on-device.
>
> The model you point it at is yours. Point it at Ollama and nothing leaves the
> laptop at all.
>
> Apache-2.0. github.com/Moin105/karst

**D7 — the cost meter.** *Asset: screenshot of the real cost line.*
> Every answer now prints what it actually cost — real provider token counts, not
> an estimate:
>
> `1,840 in + 612 out tok | $0.0276 + $0.0459 = $0.0735`
>
> You see the estimate before the call and the real bill after. Local models show
> tokens, no dollars.

**D8 — the comparison.** *Asset: `19-compare-1x1`.*
> Whole-repo context: ~5,000 chunks, no idea what got sent, bill arrives monthly.
>
> Pack-scoped: ~200 chunks, every one cited, cost printed before you hit enter.
>
> Same question. ~60% fewer tokens.

**D9 — the install post.** *Asset: `15-install-1x1` or `16-install-16x9`.*
> ```
> uv tool install karst
> cd your-project
> karst quickstart
> ```
>
> Indexes, builds the call graph, suggests packs. One command, then ask it things.
>
> pypi.org/project/karst/

**D10 — the MCP angle.**
> karst speaks MCP, so it drops into Claude Code, Cursor, or anything else that
> talks the protocol — no per-tool integration.
>
> Your agent gets `search_code` and `impact` as tools. It stops guessing which
> files matter.

**IG this week:** carousel of `15-install` → `09-feature-cited` → `11-feature-local`
(the pairing already recommended in `social/README.md:110`), plus
`anim-terminal.gif` → MP4 as a second Reel.

---

## Repeatable formats (after week 2)

Rotate these indefinitely — you'll never run out.

| Format | Cadence | What it is |
|---|---|---|
| **Blast radius of the day** | 2×/wk | Run `impact` on a well-known OSS repo, screenshot the surprise. Highest-performing format you have. |
| **Shipped** | per release | One concrete v0.2.x change, with the before/after output. |
| **Parser war story** | 1×/wk | tree-sitter, incremental indexing, encoding bugs. Buys credibility. |
| **Receipt** | 1×/wk | A real number with the command to reproduce it. |
| **Reply-guy** | daily | Answer "how do I give my agent codebase context" wherever it's asked. Highest-conversion activity, zero posts required. |

**"Blast radius of the day" is your franchise.** Clone a repo people know
(fastapi, httpx, pydantic), run `graph-index` + `impact` on a core symbol, and
post the output. It demos the product without being about the product, it's
infinitely repeatable, and it invites "run it on X" replies — which is free
content direction forever.

---

## Instagram rules

Instagram is **repurpose-only**. Zero net-new work. If a Reel outperforms your X
posts by 10× after ~6 weeks, revisit; otherwise this stays a mirror.

- Reels only for motion (`animated/gif/*.gif` → MP4, ffmpeg one-liner is in
  `social/README.md:33`). Static cards at **4:5**, never 1:1 in feed.
- Burn captions in — autoplay is muted, and every video script in
  `VIDEO-SCRIPTS.md` is already written silent-readable.
- Link in bio → `karst.dev` once attached; the landing page converts far better
  than a GitHub repo does for a cold, non-technical-first audience.
- Hashtags: `#mcp #cursor #claudecode #devtools #python #ai` — never `#karst`.
- First 2 seconds carry the hook. Terminal output on screen immediately.

---

## Not yet

**Reddit** — the highest-risk channel, and the current account (`Wise_Collar6067`)
is not the one to use.

`Adjective_Noun####` is Reddit's auto-generated username format, and **usernames
are permanent** — it cannot be renamed. So this account will read as a throwaway
forever, which is precisely the profile Reddit's spam heuristics and human mods
are tuned to remove. It has the worst of both worlds: not a recognisable brand,
not a recognisable person.

**Reddit is hostile to brand accounts and friendly to identifiable builders.**
"I built this, here's how it works, happy to answer questions" from a human
account with real history is welcome in most dev subs. The same words from
`Wise_Collar6067` get filtered. Create a personal account, use it as yourself,
and let karst come up because you built it.

**Do not connect any Reddit account to the Social Studio's auto-publish.** This
is the one place where an automation mistake is unrecoverable:

- Automated submissions from a low-karma account are the fastest route to a
  **sitewide shadowban** — where posts appear normal to you and are invisible to
  everyone else, so you can burn weeks before noticing.
- Worse, repeated self-promo gets **the domain banned sitewide**. A `karst.dev`
  domain ban is effectively permanent and would silently kill every link to it on
  Reddit forever — including ones posted by other people. That single risk
  outweighs everything Reddit could plausibly give you in month one.

Post to Reddit **by hand**, always. Leave `REDDIT_CLIENT_ID`/`SECRET`/`USERNAME`/
`PASSWORD` unset in the dashboard so the channel stays "not configured".

**The protocol, once a proper account exists:**

1. **Weeks 1–3: comment only.** 5–10 substantive comments a day in r/mcp,
   r/cursor, r/ClaudeAI, r/ClaudeCode, r/LocalLLaMA, r/ExperiencedDevs, r/Python.
   Zero mentions of karst. You are building history and karma.
2. **Read each sub's rules and sidebar before posting.** Several ban self-promo
   outright; some have a designated weekly thread, which is the correct venue.
3. **Roughly 9:1** — nine posts contributing nothing of your own for every one
   that mentions your project. This is Reddit's informal norm and mods enforce it.
4. **Lead with the technical content, not the tool.** "I built a call-graph
   walker to answer what-breaks-if-I-change-this — here's what I learned about
   tree-sitter name resolution" lands. "Check out my new tool" does not.
5. **Disclose authorship in the post itself.** Getting caught concealing it is
   far more damaging than declaring it.
6. **One sub at a time, spaced days apart.** Cross-posting the same thing to five
   subs at once is the single most reliable spam signal there is.

**Discord** — the cheapest channel to switch on: `DISCORD_WEBHOOK_URL` is a
5-minute setup with no OAuth and no review, so use it to prove the Social Studio
pipeline end-to-end before wrestling with X's API keys or Instagram's Graph API.
Post the GIFs there directly; Discord autoplays them inline.

**Hacker News** — one shot. Blocked on: (1) `karst.dev` attached to the live
Vercel project, (2) more than zero GitHub stars, (3) the stdout/stderr fix so the
hero screenshot renders clean. Show HN title to use:

> Show HN: karst – local call-graph code context for AI dev tools, no code leaves your machine

**LinkedIn** — the enterprise gateway's real channel (air-gap pack, security
questionnaire, per-team isolation). Different audience, different account,
different message. Not mixed into the above.
