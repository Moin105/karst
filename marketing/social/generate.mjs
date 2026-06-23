// Generates the karst social-media graphics as SVG, one file per card.
// Brand: dark canvas, indigo + emerald accents, JetBrains Mono for code,
// Inter for everything else, the rock-creature mark. Run: node generate.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const C = {
  bg: '#0a0a0f', panel: '#0f172a', border: '#1f2937',
  text: '#f8fafc', dim: '#94a3b8',
  indigo: '#818cf8', emerald: '#34d399',
};
const SANS = "Inter, 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', Consolas, monospace";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Rock-creature mark (viewBox 64), placed/scaled.
function mark(x, y, s) {
  const t = `translate(${x} ${y}) scale(${s / 64})`;
  return `<g transform="${t}">
    <path d="M26 55L21 62M38 55L43 62" fill="none" stroke="#3a2a18" stroke-width="5" stroke-linecap="round"/>
    <path d="M22 36L12 24L8 13M42 36L52 24L56 13" fill="none" stroke="#3a2a18" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M22 36L12 24L8 13M42 36L52 24L56 13" fill="none" stroke="#b9895c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <polygon points="32,28 18,38 24,56 32,52" fill="#b9895c"/>
    <polygon points="32,28 46,38 40,56 32,52" fill="#8f6840"/>
    <polygon points="24,33 32,28 40,33 32,38" fill="#cca57a"/>
    <polygon points="32,28 46,38 40,56 24,56 18,38" fill="none" stroke="#3a2a18" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="32" cy="42" r="2.7" fill="#34d399"/>
  </g>`;
}

function wordmark(x, y, size) {
  const s = size;
  return `${mark(x, y - s * 0.82, s)}<text x="${x + s * 1.25}" y="${y}" font-family="${SANS}" font-size="${s}" font-weight="600" fill="${C.text}">karst</text>`;
}

function installBar(cx, y, w, h, code) {
  return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h * 0.18)}" fill="${C.panel}" stroke="${C.border}"/>
    <text x="${cx}" y="${y + h * 0.64}" font-family="${MONO}" font-size="${Math.round(h * 0.42)}" fill="#e2e8f0" text-anchor="middle">${esc(code)}</text>`;
}

function pill(cx, y, w, h, label, color) {
  const fill = color === 'emerald' ? 'rgba(52,211,153,0.10)' : 'rgba(129,140,248,0.10)';
  const stroke = color === 'emerald' ? 'rgba(52,211,153,0.4)' : 'rgba(129,140,248,0.4)';
  const txt = color === 'emerald' ? C.emerald : C.indigo;
  return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${stroke}"/>
    <text x="${cx}" y="${y + h * 0.66}" font-family="${SANS}" font-size="${Math.round(h * 0.4)}" font-weight="500" fill="${txt}" text-anchor="middle">${esc(label)}</text>`;
}

// Generic card. spec: {kind, eyebrow, lines:[], accentLine, sub, stat, statLabel, code, pills:[]}
function card(w, h, spec) {
  const land = w > h * 1.2;
  const u = Math.min(w, h);
  const accentColor = spec.accent === 'emerald' ? C.emerald : C.indigo;
  let body = '';

  // background + soft accent glow
  body += `<rect width="${w}" height="${h}" fill="${C.bg}"/>`;
  body += `<circle cx="${land ? w * 0.82 : w * 0.5}" cy="${land ? h * 0.2 : h * 0.18}" r="${u * 0.62}" fill="${accentColor}" opacity="0.06"/>`;

  const cx = w / 2;
  const ax = land ? w * 0.055 : cx;            // anchor x
  const anchor = land ? 'start' : 'middle';
  const margin = w * 0.055;

  // logo lockup (top-left always, smaller on landscape)
  body += wordmark(margin, h * 0.12, u * 0.07);

  // vertical layout: stat cards center the number; text cards stack from a band
  if (spec.stat) {
    body += `<text x="${cx}" y="${h * 0.5 + u * 0.13}" font-family="${SANS}" font-size="${u * 0.36}" font-weight="700" fill="${C.emerald}" text-anchor="middle">${esc(spec.stat)}</text>`;
    if (spec.statLabel) body += `<text x="${cx}" y="${h * 0.5 + u * 0.27}" font-family="${SANS}" font-size="${u * 0.06}" font-weight="600" fill="${C.text}" text-anchor="middle">${esc(spec.statLabel)}</text>`;
    if (spec.sub) body += `<text x="${cx}" y="${h * 0.5 + u * 0.355}" font-family="${SANS}" font-size="${u * 0.042}" fill="${C.dim}" text-anchor="middle">${esc(spec.sub)}</text>`;
  } else {
    let y = land ? h * 0.38 : h * 0.42;
    const hsize = land ? w * 0.062 : u * 0.085;
    if (spec.eyebrow) {
      body += `<text x="${ax}" y="${y - hsize - u * 0.05}" font-family="${MONO}" font-size="${u * 0.038}" font-weight="500" fill="${accentColor}" text-anchor="${anchor}" letter-spacing="2">${esc(spec.eyebrow)}</text>`;
    }
    for (const line of spec.lines) {
      const fill = line.accent ? accentColor : C.text;
      body += `<text x="${ax}" y="${y}" font-family="${SANS}" font-size="${hsize}" font-weight="700" fill="${fill}" text-anchor="${anchor}">${esc(line.t ?? line)}</text>`;
      y += hsize * 1.08;
    }
    if (spec.sub) {
      body += `<text x="${ax}" y="${y + u * 0.02}" font-family="${SANS}" font-size="${u * 0.044}" fill="${C.dim}" text-anchor="${anchor}">${esc(spec.sub)}</text>`;
    }
  }

  // pills row
  if (spec.pills && spec.pills.length) {
    const ph = u * 0.072, pad = u * 0.03;
    const widths = spec.pills.map((p) => Math.max(u * 0.2, p.label.length * u * 0.026 + pad * 2));
    const total = widths.reduce((a, b) => a + b, 0) + pad * (spec.pills.length - 1);
    let px = land ? margin + widths[0] / 2 : cx - total / 2 + widths[0] / 2;
    const py = h * 0.8;
    spec.pills.forEach((p, i) => {
      body += pill(px, py, widths[i], ph, p.label, p.color);
      if (i < spec.pills.length - 1) px += widths[i] / 2 + pad + widths[i + 1] / 2;
    });
  }

  // install bar bottom
  if (spec.code) {
    const bw = Math.min(w * 0.86, spec.code.length * u * 0.05 + u * 0.12);
    const bh = u * 0.085;
    body += installBar(land ? margin + bw / 2 : cx, h * 0.875, bw, bh, spec.code);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

const SQ = [1080, 1080], LS = [1600, 900], PT = [1080, 1350], ST = [1080, 1920];

const cards = [
  ['01-announce-16x9', LS, { eyebrow: 'MCP-NATIVE · APACHE-2.0', lines: [{ t: 'Code context' }, { t: 'for AI dev tools' }], sub: 'Graph-grounded, pack-scoped retrieval over MCP.', code: 'pip install karst', pills: [{ label: '60% fewer tokens', color: 'emerald' }, { label: 'cited file:line', color: 'indigo' }] }],
  ['02-announce-1x1', SQ, { eyebrow: 'MCP-NATIVE · OPEN SOURCE', lines: [{ t: 'Code context' }, { t: 'for AI' }, { t: 'dev tools' }], sub: 'Precise, cited, token-efficient.', code: 'pip install karst' }],
  ['03-announce-4x5', PT, { eyebrow: 'MCP-NATIVE', lines: [{ t: 'Code context' }, { t: 'for AI' }, { t: 'dev tools' }], sub: 'Graph-grounded retrieval over MCP.', code: 'pip install karst' }],
  ['04-stat-tokens-1x1', SQ, { stat: '60%', statLabel: 'fewer tokens', sub: 'vs dumping raw files into the model' }],
  ['05-stat-tokens-16x9', LS, { stat: '60%', statLabel: 'fewer tokens', sub: 'pack-scoped retrieval vs raw file dumping' }],
  ['06-stat-reindex-1x1', SQ, { stat: '2.3s', statLabel: 'incremental re-index', sub: 'first run 343s, then seconds' }],
  ['07-feature-packs-4x5', PT, { eyebrow: 'FEATURE', lines: [{ t: 'Curated' }, { t: 'packs' }], sub: 'Named bundles of related code. Curate once, reuse.' }],
  ['08-feature-blastradius-4x5', PT, { eyebrow: 'FEATURE', lines: [{ t: 'Blast' }, { t: 'radius', accent: true }], sub: 'See what breaks before you change it.' }],
  ['09-feature-cited-1x1', SQ, { eyebrow: 'FEATURE', lines: [{ t: 'Cited to' }, { t: 'file:line', accent: true }], sub: 'Every answer you can verify. No black box.' }],
  ['10-feature-cost-1x1', SQ, { eyebrow: 'FEATURE', lines: [{ t: 'See the' }, { t: 'cost first' }], sub: 'Token + dollar estimate, before you spend.' }],
  ['11-feature-local-16x9', LS, { eyebrow: 'PRIVATE BY DESIGN', lines: [{ t: 'Runs on your machine' }], sub: 'Local-first. With a local model, your code never leaves.', pills: [{ label: 'air-gappable', color: 'emerald' }, { label: 'no API key', color: 'indigo' }] }],
  ['12-registry-9x16', ST, { eyebrow: 'NEW', lines: [{ t: 'Now on the' }, { t: 'official MCP' }, { t: 'Registry', accent: true }], code: 'uvx --from karst karst-mcp' }],
  ['13-registry-1x1', SQ, { eyebrow: 'NEW', lines: [{ t: 'On the official' }, { t: 'MCP Registry', accent: true }], code: 'uvx --from karst karst-mcp' }],
  ['14-private-4x5', PT, { eyebrow: 'FOR REGULATED TEAMS', lines: [{ t: 'Self-hosted' }, { t: '& private' }], sub: 'Apache-2.0. Air-gappable. No code leaves.' }],
  ['15-install-1x1', SQ, { eyebrow: 'GET STARTED', lines: [{ t: 'Index your' }, { t: 'repo in 5 min' }], sub: 'No API key needed.', code: 'pip install karst' }],
  ['16-install-16x9', LS, { eyebrow: 'GET STARTED IN 60 SECONDS', lines: [{ t: 'cd your-repo && karst quickstart' }], sub: 'Index + graph + packs, one command.', code: 'pip install karst' }],
  ['17-quote-16x9', LS, { lines: [{ t: 'The context layer' }, { t: 'between your codebase' }, { t: 'and any AI tool.', accent: true }] }],
  ['18-quote-4x5', PT, { lines: [{ t: 'Stop dumping' }, { t: 'your whole repo' }, { t: 'into the model.', accent: true }] }],
  ['19-compare-1x1', SQ, { eyebrow: 'PACK-SCOPED RETRIEVAL', lines: [{ t: '5,000' }, { t: '→ 25 chunks', accent: true }], sub: 'precise context, not noise' }],
  ['20-hero-1x1', SQ, { lines: [{ t: 'karst' }], sub: 'code context for AI dev tools', pills: [{ label: 'MCP-native', color: 'indigo' }, { label: 'Apache-2.0', color: 'emerald' }] }],
];

mkdirSync(new URL('./svg/', import.meta.url), { recursive: true });
for (const [name, [w, h], spec] of cards) {
  writeFileSync(new URL(`./svg/${name}.svg`, import.meta.url), card(w, h, spec));
  console.log(`ok  ${name}.svg  (${w}x${h})`);
}
console.log(`\n${cards.length} cards written to svg/`);
