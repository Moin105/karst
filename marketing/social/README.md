# karst — social media kit

Launch assets for karst, ready for Twitter/X, Discord, Reddit, and Instagram.
Everything is generated from code so it stays on-brand and is trivial to re-render
after a copy change.

```
social/
├── generate.mjs        # builds the 20 static cards → svg/
├── render.mjs          # svg/ → png/ (pixel-exact, via @resvg/resvg-js)
├── svg/                # 20 editable source cards
├── png/                # 20 ready-to-post PNGs
└── animated/
    ├── *.svg           # 5 looping animations (SMIL)
    ├── capture-anim.mjs# animations → gif/ (drives your installed Chrome, pure JS)
    └── gif/            # generated GIFs (post these anywhere)
```

## Quick start

```bash
cd marketing/social
npm i                       # resvg (static cards) + puppeteer-core/pngjs/gifenc (gifs)
node generate.mjs           # (re)build the 20 SVG cards
node render.mjs             # SVG → PNG
node animated/capture-anim.mjs   # animated SVG → looping GIF (no ffmpeg needed)
```

The GIF step drives the Chrome/Edge you already have installed (via `puppeteer-core`)
to play the SMIL timeline, then encodes a GIF in pure JS — **no ffmpeg, no Chromium
download**. If your browser is in a non-standard location, set `CHROME_PATH`.

**Want MP4s too?** Install ffmpeg (`winget install Gyan.FFmpeg`) and convert any GIF:
```bash
ffmpeg -i animated/gif/anim-flow.gif -movflags +faststart -pix_fmt yuv420p anim-flow.mp4
```

---

## The 20 static cards

Each card is named `NN-topic-RATIO`. The ratio tells you where it fits best.

| # | File | Ratio | What it says |
|---|------|-------|--------------|
| 01 | announce | 16:9 | Launch announcement (X/blog header) |
| 02 | announce | 1:1 | Launch announcement (IG/Discord) |
| 03 | announce | 4:5 | Launch announcement (IG portrait) |
| 04 | stat-tokens | 1:1 | ~60% fewer tokens |
| 05 | stat-tokens | 16:9 | ~60% fewer tokens (wide) |
| 06 | stat-reindex | 1:1 | Incremental re-index speed |
| 07 | feature-packs | 4:5 | Packs = scoped retrieval |
| 08 | feature-blastradius | 4:5 | Impact / blast radius |
| 09 | feature-cited | 1:1 | Cited `file:line` answers |
| 10 | feature-cost | 1:1 | Token/cost meter |
| 11 | feature-local | 16:9 | Runs 100% local |
| 12 | registry | 9:16 | Live on the MCP Registry (Stories/Reels) |
| 13 | registry | 1:1 | Live on the MCP Registry |
| 14 | private | 4:5 | Your code never leaves your machine |
| 15 | install | 1:1 | `pip install karst` |
| 16 | install | 16:9 | `pip install karst` (wide) |
| 17 | quote | 16:9 | Pull-quote / positioning |
| 18 | quote | 4:5 | Pull-quote (portrait) |
| 19 | compare | 1:1 | karst vs. whole-repo dump |
| 20 | hero | 1:1 | Brand hero / avatar |

## The 5 animations

| File | Ratio | Loop | Use for |
|------|-------|------|---------|
| `anim-logo-reveal` | 1:1 | 4.5s | Brand sting / profile video |
| `anim-flow` | 16:9 | 5s | "How it works": index → pack → serve |
| `anim-token-counter` | 1:1 | 4s | The 60%-fewer-tokens hook |
| `anim-blast-radius` | 1:1 | 5s | Impact analysis differentiator |
| `anim-terminal` | 16:9 | 6s | Ask → cited answer demo |

Each exports to a looping **GIF** (silent, universal — works in feeds, Reddit/Discord
embeds, GitHub READMEs). Convert to MP4 with the ffmpeg one-liner above where you want
a smaller, autoplay-friendly file (X / Instagram feed).

---

## Platform → ratio cheat sheet

Pick the asset whose ratio matches the slot. When in doubt, **1:1 is the safest
single post** (renders well everywhere); **9:16 is for Stories/Reels/Shorts**.

### Twitter / X
- In-feed image/card: **16:9** (`01`, `05`, `11`, `16`, `17`) or **1:1**.
- In-feed video/GIF: **16:9** or **1:1** — `anim-terminal`, `anim-flow` (GIF, or MP4 via ffmpeg).
- Profile avatar: **1:1** `20-hero`.

### Discord
- Channel post / embed: **1:1** PNGs embed cleanly; **16:9** for wide banners.
- Animated: post the **GIF** (Discord autoplays GIFs in-chat) — `anim-logo-reveal`, `anim-token-counter`.
- Server icon: **1:1** `20-hero`.

### Reddit
- Image post: **1:1** or **4:5** (`02`, `07`, `08`, `14`, `19`).
- Comment / inline: use the **GIF** (`gif/*.gif`) — videos don't inline in comments.
- Keep text legible at thumbnail size: `04`, `09`, `15` read well small.

### Instagram
- Feed (portrait, best reach): **4:5** (`03`, `07`, `08`, `14`, `18`).
- Feed (square): **1:1**.
- Stories / Reels: **9:16** (`12`); for motion, convert a GIF to MP4 (ffmpeg one-liner above).
- Carousel: pair `15-install` + `09-feature-cited` + `11-feature-local`.

### Ratio → where it shines
| Ratio | Primary homes |
|-------|---------------|
| 1:1 (1080×1080) | Discord, Reddit, IG feed, X feed, avatars — universal |
| 16:9 (1600×900) | X cards, YouTube thumbs, blog headers, wide banners |
| 4:5 (1080×1350) | Instagram feed (max portrait), Reddit |
| 9:16 (1080×1920) | IG Stories/Reels, TikTok, YT Shorts |

---

## Editing copy

All text lives in `generate.mjs` (the `cards` array) — edit there, then
`node generate.mjs && node render.mjs`. Don't hand-edit files in `svg/` or `png/`;
they're regenerated. Brand colors and the logo mark are defined once at the top of
`generate.mjs` so a single change propagates to every card.

Fonts: the renderers use system **Segoe UI** (for Inter) and **Consolas** (for
JetBrains Mono) so output is reproducible without font downloads. Install Inter +
JetBrains Mono locally if you want the exact brand faces.

## Notes
- `node_modules/` and `package-lock.json` are gitignored here; `svg/`, `png/`, and
  `animated/gif/` outputs are committed so the kit is usable without a build.
- Videos: see `../VIDEO-SCRIPTS.md` for 5 shot-listed scripts (two of which are just
  these animations — record them or convert the GIF to MP4 with the ffmpeg one-liner).
