// Turn each animated *.svg (SMIL) into a looping GIF.
//
// resvg can't run SMIL timelines, so we drive a real browser: Puppeteer loads the
// SVG, steps the SMIL clock with svg.setCurrentTime(t), screenshots each frame,
// then gifenc encodes the frames into a looping GIF. Pure JS end-to-end — no
// ffmpeg, and puppeteer-core reuses the Chrome you already have installed.
//
// Setup (from marketing/social/):  npm i
// Run:                             node animated/capture-anim.mjs
// Out:                             animated/gif/<name>.gif
//
// Want MP4s too? Install ffmpeg and run, per animation:
//   ffmpeg -i gif/anim-flow.gif -movflags +faststart -pix_fmt yuv420p mp4/anim-flow.mp4
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;

const FPS = 20;
// loop length (s) and longest output edge (px) per file
const SPEC = {
  'anim-logo-reveal': { dur: 4.5, max: 640 },
  'anim-flow': { dur: 5, max: 800 },
  'anim-token-counter': { dur: 4, max: 640 },
  'anim-blast-radius': { dur: 5, max: 640 },
  'anim-terminal': { dur: 6, max: 800 },
  'ent-isolation': { dur: 4, max: 800 },
  'ent-gateway': { dur: 3.6, max: 800 },
  'ent-onprem': { dur: 4, max: 640 },
};

function findChrome() {
  const c = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const p of c) if (existsSync(p)) return p;
  throw new Error('No Chrome/Edge found. Set CHROME_PATH to a chromium binary.');
}

const dir = new URL('.', import.meta.url);
const gifDir = new URL('./gif/', import.meta.url);
mkdirSync(gifDir, { recursive: true });

const svgs = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: 'new',
  args: ['--force-color-profile=srgb', '--hide-scrollbars'],
});

for (const file of svgs) {
  const name = file.replace(/\.svg$/, '');
  const { dur, max } = SPEC[name] ?? { dur: 5, max: 720 };
  const svg = readFileSync(new URL(file, dir), 'utf8');
  const m = svg.match(/width="(\d+)"\s+height="(\d+)"/);
  const [vw, vh] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  const scale = max / Math.max(vw, vh);
  const [w, h] = [Math.round(vw * scale), Math.round(vh * scale)];

  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><head><style>
       html,body{margin:0;padding:0;background:#0a0a0f;overflow:hidden}
       svg{display:block;width:${w}px;height:${h}px}
     </style></head><body>${svg}</body></html>`,
    { waitUntil: 'load' }
  );

  const frameCount = Math.round(dur * FPS);
  const rgbaFrames = [];
  for (let i = 0; i < frameCount; i++) {
    const t = i / FPS;
    await page.evaluate((tt) => {
      const s = document.querySelector('svg');
      s.pauseAnimations();
      s.setCurrentTime(tt);
    }, t);
    const buf = await page.screenshot({ type: 'png' });
    const png = PNG.sync.read(buf);
    rgbaFrames.push(new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length));
  }
  await page.close();

  // one global palette (sampled across frames) so colors don't flicker
  const sampleIdx = [];
  for (let k = 0; k < 8; k++) sampleIdx.push(Math.min(frameCount - 1, Math.round((k / 7) * (frameCount - 1))));
  const sample = new Uint8Array(sampleIdx.length * w * h * 4);
  sampleIdx.forEach((fi, k) => sample.set(rgbaFrames[fi], k * w * h * 4));
  const palette = quantize(sample, 256, { format: 'rgb565' });

  const gif = GIFEncoder();
  for (const frame of rgbaFrames) {
    const index = applyPalette(frame, palette, 'rgb565');
    gif.writeFrame(index, w, h, { palette, delay: Math.round(1000 / FPS), repeat: 0 });
  }
  gif.finish();
  const bytes = gif.bytes();
  writeFileSync(new URL(`${name}.gif`, gifDir), bytes);
  console.log(`  ${name}.gif  ${w}x${h}  ${frameCount}f  ${(bytes.length / 1024).toFixed(0)} KB`);
}

await browser.close();
console.log(`\nDone. ${svgs.length} GIFs written to animated/gif/.`);
