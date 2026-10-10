// Plays the app in phone-sized Chromium: add players, drag a piece, switch
// players, reload offline through the service worker, then pick a start level,
// abandon a game and use the game list. Dev only; needs
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
// Drags tray pieces onto the board until one lands.
async function placeOne(page) {
  const board = await page.locator('#board').boundingBox();
  const before = await page.locator('.cell.f').count();
  for (let slotIndex = 0; slotIndex < 3; slotIndex++) for (const [dx, dy] of [[0, 0], [-0.25, -0.25], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25]]) {
    const slot = await page.locator('.slot').nth(slotIndex).boundingBox();
    const from = [slot.x + slot.width / 2, slot.y + slot.height / 2];
    const to = [board.x + board.width * (0.5 + dx), board.y + board.height * (0.5 + dy) + 70];
    await page.mouse.move(...from);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(from[0] + (to[0] - from[0]) * i / 10, from[1] + (to[1] - from[1]) * i / 10);
    await page.mouse.up();
    if (await page.locator('.cell.f').count() !== before) return;
  }
  throw new Error('no piece could be placed');
}

async function levels() {
  const ctx = await browser.newContext({ ...devices['iPhone 15'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('levels: ' + e.message));
  await page.goto('http://localhost:8181/');
  await page.fill('#nameIn', 'Mia');
  await page.click('#addForm button[type=submit]');
  // Mia has reached level 4 before: levels 1-4 are open.
  await page.evaluate(() => {
    const id = JSON.parse(localStorage.getItem('bb-current'));
    localStorage.setItem(`bb-p-${id}-scores`, JSON.stringify([{ score: 400, level: 4, date: 5 }]));
  });
  await page.reload();
  await page.waitForSelector('.slot');
  await page.click('#newBtn');
  await page.waitForSelector('#startLv');
  const open = await page.locator('#startLv button:not([disabled])').count();
  if (open !== 4) throw new Error('expected 4 open start levels, got ' + open);
  await page.click('#startLv button[data-lv="3"]');
  await page.screenshot({ path: out + 'levels-pick.png' });
  await page.click('#goBtn');
  if (await page.textContent('#lvl') !== '3') throw new Error('did not start at level 3');
  console.log('levels: started at level', await page.textContent('#lvl'), await page.textContent('#lvlname'));

  // Play a move, then replace the game: it is listed as abandoned.
  await placeOne(page);
  await page.click('#newBtn');
  await page.waitForSelector('text=abandoned');
  await page.click('#startLv button[data-lv="1"]');
  await page.click('#goBtn');
  await placeOne(page);
  await page.click('#scoresBtn');
  await page.waitForSelector('#historyBtn');
  await page.screenshot({ path: out + 'levels-scores.png' });
  await page.click('#historyBtn');
  await page.waitForSelector('#games li');
  const rows = (await page.locator('#games li').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
  console.log('levels: game list', rows);
  if (rows.length !== 2 || !rows[0].includes('in progress') || !rows[1].includes('abandoned') || !rows[1].includes('from level 3')) throw new Error('unexpected game list');
  await page.screenshot({ path: out + 'levels-history.png' });
  await page.click('#games button[data-del]');
  await page.click('#goBtn');
  await page.waitForSelector('#games li');
  if (await page.locator('#games li').count() !== 1) throw new Error('delete did not remove the game');
  console.log('levels: deleted the abandoned game');
  await ctx.close();
}

await run('iPhone SE', 'se');
await run('iPhone 15', 'i15');
await levels();
await browser.close();
server.close();
console.log(errors.length ? errors : 'no page errors');
if (errors.length) process.exitCode = 1;
