// Render every svg/*.svg to a pixel-exact png/*.png. Uses system fonts
// (Segoe UI / Consolas on Windows) as close stand-ins for Inter / JetBrains
// Mono so the PNGs render without flaky font downloads. Run: node render.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svgDir = new URL('./svg/', import.meta.url);
const pngDir = new URL('./png/', import.meta.url);
mkdirSync(pngDir, { recursive: true });

const files = readdirSync(svgDir).filter((f) => f.endsWith('.svg')).sort();
for (const f of files) {
  const svg = readFileSync(new URL(f, svgDir), 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    background: '#0a0a0f',
    font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
  });
  const png = resvg.render().asPng();
  writeFileSync(new URL(f.replace(/\.svg$/, '.png'), pngDir), png);
  console.log(`png  ${f.replace(/\.svg$/, '.png')}  ${(png.length / 1024).toFixed(0)} KB`);
}
console.log(`\n${files.length} PNGs written to png/`);
