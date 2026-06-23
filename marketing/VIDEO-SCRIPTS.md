# karst — video scripts & storyboards

Five short videos for launch. Each is shot-listed so you (or an editor) can record
and cut without guesswork. Keep them **silent-readable** — most social autoplay is
muted, so every key line must be on-screen text. Voiceover/music is optional polish.

**House style**
- Background `#0a0a0f`, text `#f8fafc`, dim `#94a3b8`, indigo `#818cf8`, emerald `#34d399`.
- Font: Inter / Segoe UI for copy, JetBrains Mono / Consolas for code.
- End card every video: rock-creature mark + `karst` + `pip install karst`.
- Screen-record at 1080p+; export the master at the ratio for the platform (see
  `social/README.md`). Square (1:1) and vertical (9:16) get the most reach.

Two of these (V1, V2) already exist as animations in `social/animated/` — run
`node animated/capture-anim.mjs` to get looping GIFs, then (optionally) convert a GIF
to MP4 with the ffmpeg one-liner in `social/README.md`. So you can skip filming them.

---

## V1 — "What is karst?" (15s, 1:1 + 9:16)
**Goal:** one-line positioning for a cold audience.
**Source:** `social/animated/anim-logo-reveal.svg` → MP4, then add the three text beats below.

| t | on-screen | notes |
|---|-----------|-------|
| 0–2s | rock mark scales in, `karst` wordmark resolves | logo reveal animation |
| 2–6s | "Your AI coding tool is guessing about your codebase." | white text, fades in |
| 6–10s | "karst gives it **cited, pack-scoped context** over MCP." | emerald highlight on "cited" |
| 10–13s | "Runs 100% local. Your code never leaves your machine." | dim subtext |
| 13–15s | end card: mark + `pip install karst` | hold 2s |

**Caption:** karst is an MCP server that feeds your AI dev tools real, cited context from your repo — fully local. `pip install karst`

---

## V2 — "Ask your codebase" (20s, 16:9 + 1:1)
**Goal:** show the core loop — a question in, a cited answer out.
**Source:** `social/animated/anim-terminal.svg` → MP4.

| t | on-screen | notes |
|---|-----------|-------|
| 0–2s | empty terminal, blinking caret | |
| 2–6s | types `karst ask "how does auth work?"` | typing animation |
| 6–9s | thinking dots, then answer streams in | |
| 9–15s | answer cites `auth.py:42` and `middleware.ts:18` | highlight the file:line cites |
| 15–18s | "3 sources — no hallucinated paths." | emerald |
| 18–20s | end card | |

**Caption:** Stop pasting files into chat. Ask karst and get an answer with exact `file:line` citations. Built on tree-sitter + local embeddings.

---

## V3 — "60% fewer tokens" (15s, 1:1)
**Goal:** the cost/efficiency hook for a technical, budget-aware audience.
**Source:** `social/animated/anim-token-counter.svg` → MP4.

| t | on-screen | notes |
|---|-----------|-------|
| 0–3s | "Dumping your whole repo into context is expensive." | |
| 3–9s | counter ticks 142,000 → 51,000 tokens, bar shrinks | the count-down animation |
| 9–12s | "Packs scope retrieval to what actually matters." | |
| 12–15s | "~60% fewer tokens. Lower cost. Tighter answers." + end card | emerald |

**Caption:** karst groups your repo into packs and retrieves only the relevant one — ~60% fewer tokens per question vs. whole-repo context.

---

## V4 — "Know the blast radius" (18s, 1:1 + 9:16)
**Goal:** the impact-analysis differentiator vs. plain semantic search.
**Source:** `social/animated/anim-blast-radius.svg` → MP4.

| t | on-screen | notes |
|---|-----------|-------|
| 0–3s | "About to change `User.model`. What breaks?" | mono, indigo |
| 3–10s | center node pulses, edges draw out to auth.py, session.py, api.py, login.tsx, tests/ | graph animation |
| 10–14s | "karst walks the real call & import graph." | not vibes, not grep |
| 14–18s | "`karst impact` — see every caller before you touch it." + end card | |

**Caption:** Semantic search finds similar code. karst's graph finds *dependent* code. `karst impact <symbol>` shows the real blast radius before you refactor.

---

## V5 — "Runs on your laptop, stays on your laptop" (20s, 16:9 + 1:1)
**Goal:** the trust / air-gapped hook for IP-sensitive teams. This one is **filmed**, not animated.
**Shot list:**

| t | shot | on-screen text |
|---|------|----------------|
| 0–3s | screen-record: `pip install karst` then `karst index .` running | "One command. Indexes locally." |
| 3–7s | split: terminal on left, a network monitor (e.g. `netstat`/Little Snitch) showing **no outbound** on the right | "Watch the network. Nothing leaves." |
| 7–12s | terminal: `karst ask "..."` returns a cited answer | "Embeddings + vector DB run on-device." |
| 12–16s | show `--llm local` pointing at Ollama `localhost:11434` | "Plug in a local LLM for a fully air-gapped setup." |
| 16–20s | end card + line "Built for teams that can't ship code to a third party." | |

**Caption:** No cloud, no telemetry, no code leaving the building. karst indexes and answers entirely on-device — pair it with a local LLM for a fully air-gapped workflow. See `docs/SELF-HOSTED.md`.

---

### Production checklist
- [ ] Export each master at the platform ratio (`social/README.md` has the map).
- [ ] Burn captions into the 9:16 / 1:1 cuts (autoplay is muted).
- [ ] Keep the first 2s landing the hook — feeds cut off fast.
- [ ] End every cut on the `pip install karst` card.
- [ ] Post the GIF (`social/animated/gif/`) where video isn't supported (Reddit comments, GitHub README, Discord embeds).
