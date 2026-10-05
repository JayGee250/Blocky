// Renders the app icons (app/icons/*.png) from a small drawn grid of pieces.
// Needs Playwright with Chromium (dev only; the app itself needs nothing).
//   node tools/make-icons.js
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
// 4x4 board, brightest piece colors from the game: '.' empty, letters are pieces.
const art = ['oob.', 'o.bb', 'rrbb', 'g...'];
const fill = { o: '#ffb020', b: '#3d8bff', r: '#ff5a5f', g: '#38c172' };
const inset = 100, gap = 14, size = (512 - 2 * inset - 3 * gap) / 4;
let cells = '';
art.forEach((line, r) => [...line].forEach((ch, c) => {
  const x = inset + c * (size + gap), y = inset + r * (size + gap);
  cells += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="14" fill="${fill[ch] || '#3f6646'}"/>`;
  if (fill[ch]) cells += `<rect x="${x}" y="${y}" width="${size}" height="10" rx="5" fill="#fff" opacity=".35"/>`;
}));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#2b4a31"/>${cells}</svg>`;
writeFileSync(new URL('app/icons/icon.svg', root), svg + '\n');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, px] of [['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512]]) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${px}" height="${px}" `)}</body>`);
  writeFileSync(new URL(`app/icons/${name}.png`, root), await page.screenshot({ omitBackground: false }));
  console.log(`wrote app/icons/${name}.png`);
}
await browser.close();
