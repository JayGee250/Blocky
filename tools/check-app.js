// Plays the app in phone-sized Chromium: add players, drag a piece, switch
// players, then reload offline through the service worker. Dev only; needs
// Playwright. Screenshots go to the folder given (default: your temp folder).
//   node tools/check-app.js [screenshot-folder]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = (process.argv[2] || tmpdir()) + '/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html');
  try { const body = await readFile(join(root, path)); res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(8181);
const browser = await chromium.launch();
const errors = [];
async function run(devName, tag) {
  const ctx = await browser.newContext({ ...devices[devName] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(tag + ': ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(tag + ' console: ' + m.text()));
  await page.goto('http://localhost:8181/');
  await page.waitForSelector('#nameIn');
  await page.screenshot({ path: out + tag + '-welcome.png' });
  await page.fill('#nameIn', 'Mia');
  await page.click('#addForm button[type=submit]');
  await page.waitForSelector('#overlay', { state: 'hidden' });
  // drag first tray piece to board center using touch-like pointer
  const slot = await page.locator('.slot').first().boundingBox();
  const board = await page.locator('#board').boundingBox();
  const before = await page.locator('.cell.f').count();
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(slot.x + slot.width/2 + (board.x + board.width/2 - slot.x - slot.width/2) * i/10, slot.y + slot.height/2 + (board.y + board.height/2 + 70 - slot.y - slot.height/2) * i/10);
  await page.screenshot({ path: out + tag + '-drag.png' });
  await page.mouse.up();
  const after = await page.locator('.cell.f').count();
  console.log(tag, 'placed cells', before, '->', after, 'score', await page.textContent('#score'));
  await page.click('#settingsBtn');
  await page.screenshot({ path: out + tag + '-settings.png' });
  await page.click('#closeBtn');
  // second player, picker shows on reload
  await page.click('#whoBtn');
  await page.fill('#nameIn', 'Tom');
  await page.click('#addForm button[type=submit]');
  await page.reload();
  await page.waitForSelector('#plist');
  await page.screenshot({ path: out + tag + '-picker.png' });
  const names = await page.locator('#plist button').allTextContents();
  console.log(tag, 'picker', names.map((s) => s.replace(/\s+/g, ' ').trim()));
  await page.locator('#plist button', { hasText: 'Mia' }).click();
  console.log(tag, 'Mia resumed score', await page.textContent('#score'));
  // offline
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  await page.waitForTimeout(500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#plist');
  console.log(tag, 'sw active', sw, 'offline reload ok, title', await page.title());
  const dims = await page.evaluate(() => ({ h: innerHeight, scrollH: document.documentElement.scrollHeight, board: document.getElementById('board').getBoundingClientRect().width, foot: document.querySelector('.foot').getBoundingClientRect().bottom }));
  console.log(tag, dims);
  await ctx.close();
}
await run('iPhone SE', 'se');
await run('iPhone 15', 'i15');
await browser.close();
server.close();
console.log(errors.length ? errors : 'no page errors');
if (errors.length) process.exitCode = 1;
