// Checks family accounts against the local Firebase emulators: the security
// rules, then the app itself in phone-sized Chromium (sign up, sync between two
// phones, the leaderboard, someone not on the family list, offline start).
// Dev only. Needs Java plus:
//   npm i --no-save firebase@12.19.0 firebase-tools playwright
//   npx firebase emulators:exec --only auth,firestore --project demo-bloxx "node tools/check-cloud.js [screenshot-folder]"
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, getDocs, collection, setLogLevel } from 'firebase/firestore/lite';
import { chromium, devices } from 'playwright';

const PROJECT = 'demo-bloxx';
const AUTH = 'http://127.0.0.1:9099', STORE = 'http://127.0.0.1:8080';
const root = fileURLToPath(new URL('../', import.meta.url));
const sdkDir = dirname(createRequire(import.meta.url).resolve('firebase/package.json'));
const out = (process.argv[2] || tmpdir()) + '/';
const config = { apiKey: 'demo-key', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, appId: 'demo-app' };

// The family list can only be written past the rules, as the emulator's owner.
async function addFamily(email) {
  const res = await fetch(`${STORE}/v1/projects/${PROJECT}/databases/(default)/documents/family/${encodeURIComponent(email)}`,
    { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: { name: { stringValue: email } } }) });
  assert.ok(res.ok, 'seed family ' + email);
}
async function ownerGet(path) {
  const res = await fetch(`${STORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { headers: { Authorization: 'Bearer owner' } });
  return res.ok ? res.json() : null;
}
async function denied(p, what) {
  await assert.rejects(p, (e) => e.code === 'permission-denied', what);
  console.log('  denied:', what);
}

// ---------- rules ----------
setLogLevel('silent');
console.log('rules');
const people = {};
for (const [name, email] of [['mum', 'mum@example.com'], ['kid', 'kid@example.com'], ['stranger', 'stranger@example.com']]) {
  const app = initializeApp(config, name);
  const auth = getAuth(app), db = getFirestore(app);
  connectAuthEmulator(auth, AUTH, { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const { user } = await createUserWithEmailAndPassword(auth, email, 'secret123');
  people[name] = { app, db, uid: user.uid };
}
const anon = initializeApp(config, 'anon');
const anonDb = getFirestore(anon);
connectFirestoreEmulator(anonDb, '127.0.0.1', 8080);
await addFamily('mum@example.com');
await addFamily('kid@example.com');
const { mum, kid, stranger } = people;
const userDoc = { name: 'Mum', scores: [{ score: 10, level: 1, date: 1 }], game: null, gameAt: 0, updatedAt: 1 };
const row = { name: 'Mum', best: 10, level: 1, date: 1, updatedAt: 1 };

await setDoc(doc(mum.db, 'users', mum.uid), userDoc);
await setDoc(doc(mum.db, 'leaderboard', mum.uid), row);
await setDoc(doc(kid.db, 'leaderboard', kid.uid), { ...row, name: 'Kid', best: 7 });
assert.equal((await getDoc(doc(mum.db, 'users', mum.uid))).get('name'), 'Mum');
assert.equal((await getDocs(collection(kid.db, 'leaderboard'))).size, 2);
console.log('  allowed: family write own backup and row, read the leaderboard');
await denied(getDoc(doc(anonDb, 'users', mum.uid)), 'signed out reads a backup');
await denied(getDocs(collection(anonDb, 'leaderboard')), 'signed out reads the leaderboard');
await denied(getDocs(collection(stranger.db, 'leaderboard')), 'non-family reads the leaderboard');
await denied(setDoc(doc(stranger.db, 'users', stranger.uid), userDoc), 'non-family writes own backup');
await denied(getDoc(doc(kid.db, 'users', mum.uid)), 'family reads someone else\'s backup');
await denied(setDoc(doc(kid.db, 'users', mum.uid), userDoc), 'family writes someone else\'s backup');
await denied(setDoc(doc(kid.db, 'leaderboard', mum.uid), { ...row, best: 999 }), 'family writes someone else\'s row');
await denied(setDoc(doc(mum.db, 'leaderboard', mum.uid), { ...row, admin: true }), 'extra fields on a row');
await denied(setDoc(doc(mum.db, 'leaderboard', mum.uid), { ...row, best: 'lots' }), 'a best that is not a number');
await denied(setDoc(doc(mum.db, 'users', mum.uid), { ...userDoc, name: 'x'.repeat(40) }), 'a name over 16 characters');
await denied(setDoc(doc(mum.db, 'users', mum.uid), { ...userDoc, game: 'x'.repeat(30000) }), 'an oversized saved game');
await denied(setDoc(doc(stranger.db, 'family', 'stranger@example.com'), { name: 'me' }), 'adding yourself to the family list');
await denied(getDoc(doc(mum.db, 'family', 'kid@example.com')), 'reading someone else\'s family entry');
for (const p of [mum, kid, stranger]) await deleteApp(p.app);
await deleteApp(anon);

// ---------- app ----------
console.log('app');
await addFamily('mia@example.com');
const emulatorConfig = `export const firebaseConfig = ${JSON.stringify(config)};
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
export const FIREBASE_EMULATOR = { auth: '${AUTH}', firestore: ['127.0.0.1', 8080] };`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html');
  if (path === '/app/firebase-config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(emulatorConfig); }
  try { const body = await readFile(join(root, path)); res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(8182);

const browser = await chromium.launch();
const errors = [];
async function phone(tag) {
  const ctx = await browser.newContext({ ...devices['iPhone 15'] });
  // Serve the Firebase SDK from node_modules instead of Google's CDN.
  await ctx.route('https://www.gstatic.com/firebasejs/**', async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop();
    route.fulfill({ body: await readFile(join(sdkDir, file)), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(tag + ': ' + e.message));
  await page.goto('http://localhost:8182/');
  return { ctx, page };
}
async function addPlayer(page, name) {
  await page.waitForSelector('#nameIn');
  await page.fill('#nameIn', name);
  await page.click('#addForm button[type=submit]');
  await page.waitForSelector('#overlay', { state: 'hidden' });
}
async function placeOne(page) {
  const slot = await page.locator('.slot').first().boundingBox();
  const board = await page.locator('#board').boundingBox();
  const from = [slot.x + slot.width / 2, slot.y + slot.height / 2], to = [board.x + board.width / 2, board.y + board.height / 2 + 70];
  await page.mouse.move(...from);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from[0] + (to[0] - from[0]) * i / 10, from[1] + (to[1] - from[1]) * i / 10);
  await page.mouse.up();
}
async function signIn(page, email, create) {
  await page.click('#settingsBtn');
  await page.click('#signInBtn');
  await page.fill('#emailIn', email);
  await page.fill('#passIn', 'secret123');
  await page.click(create ? '#signUpBtn' : '#goBtn');
  await page.waitForSelector('#signOutBtn');
}
const accountText = (page) => page.locator('.who-row small').last().textContent();
async function waitStatus(page, text) {
  await page.waitForFunction((t) => [...document.querySelectorAll('.who-row small')].some((s) => s.textContent.includes(t)), text, { timeout: 15000 });
}

// Phone 1: Mia has played before signing up. Her local score and game go to the account.
const one = await phone('phone1');
await addPlayer(one.page, 'Mia');
await one.page.evaluate(() => {
  const id = JSON.parse(localStorage.getItem('bb-current'));
  localStorage.setItem(`bb-p-${id}-scores`, JSON.stringify([{ score: 321, level: 2, date: 5 }]));
});
await one.page.reload();
await one.page.waitForSelector('.slot');
await placeOne(one.page);
const score1 = await one.page.textContent('#score');
assert.notEqual(score1, '0', 'placed a piece');
await signIn(one.page, 'mia@example.com', true);
await waitStatus(one.page, 'backed up');
await one.page.screenshot({ path: out + 'cloud-settings.png' });
const cloudDoc = await ownerGet(`users/${(await one.page.evaluate(() => JSON.parse(localStorage.getItem('bb-players'))[0].uid))}`);
assert.equal(cloudDoc.fields.scores.arrayValue.values[0].mapValue.fields.score.integerValue, '321');
console.log('  phone 1 signed up and backed up: score', score1, 'top score 321');

// Phone 2: a fresh phone signs in to the same account and picks up the game and scores.
const two = await phone('phone2');
await addPlayer(two.page, 'Mia');
await signIn(two.page, 'mia@example.com', false);
await waitStatus(two.page, 'backed up');
await two.page.click('#closeBtn');
await two.page.waitForFunction((s) => document.getElementById('score').textContent === s, score1);
await two.page.click('#scoresBtn');
await two.page.waitForSelector('text=Family leaderboard');
await two.page.screenshot({ path: out + 'cloud-scores.png' });
const top = await two.page.locator('ol.scores').first().locator('li').first().textContent();
assert.match(top, /321/);
console.log('  phone 2 resumed the same game (score', score1 + ') and shows the leaderboard');

// Someone not on the family list can sign up but sees nothing shared.
await two.page.click('#closeBtn');
await two.page.click('#whoBtn');
await addPlayer(two.page, 'Sam');
await signIn(two.page, 'sam@example.com', true);
await waitStatus(two.page, 'Not on the family list');
console.log('  non-family account:', await accountText(two.page));
// The same account cannot be linked to a second player on one phone.
await two.page.click('#closeBtn');
await two.page.click('#whoBtn');
await addPlayer(two.page, 'Ben');
await two.page.click('#settingsBtn');
await two.page.click('#signInBtn');
await two.page.fill('#emailIn', 'mia@example.com');
await two.page.fill('#passIn', 'secret123');
await two.page.click('#goBtn');
await two.page.waitForSelector('#authMsg:not([hidden])');
console.log('  second player, same account:', await two.page.textContent('#authMsg'));

// Wrong password message.
await two.page.fill('#passIn', 'nope12345');
await two.page.click('#goBtn');
await two.page.waitForFunction(() => document.getElementById('authMsg').textContent.includes('don’t match'));
console.log('  wrong password:', await two.page.textContent('#authMsg'));

// Phone 1 offline: the app still starts and plays, and says it will sync later.
await one.page.evaluate(async () => { await navigator.serviceWorker.ready; });
await one.page.waitForTimeout(500);
await one.ctx.setOffline(true);
await one.page.reload();
await one.page.waitForSelector('.slot');
await one.page.click('#settingsBtn');
await waitStatus(one.page, 'Offline');
console.log('  phone 1 offline start ok:', await accountText(one.page));

// Sign out keeps the local data.
await one.ctx.setOffline(false);
await one.page.click('#signOutBtn');
await one.page.click('#goBtn');
await one.page.waitForSelector('#signInBtn');
assert.equal(await one.page.evaluate(() => JSON.parse(localStorage.getItem('bb-players'))[0].uid), undefined);
console.log('  signed out on phone 1, best still', await one.page.textContent('#best'));

await browser.close();
server.close();
console.log(errors.length ? errors : 'no page errors');
if (errors.length) process.exitCode = 1;
