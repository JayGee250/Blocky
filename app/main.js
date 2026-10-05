// Family Blockblast: the game screen, player picker, scores and settings.
// Plain ES modules, no build step. tools/build-play.js inlines this file and
// its imports into web/play.html for a single-file preview, so keep every
// import on one line.
import { newGame, place, trayPieces, canPlaceSlot, isFilled, cloneBoard, FULL_ROW, LINES_PER_LEVEL, MAX_LEVEL } from '../engine/index.js';
import { createProfiles, MAX_NAME } from './profiles.js';
import { createFeedback } from './feedback.js';
import { syncPlayer } from './sync.js';
import { firebaseConfig } from './firebase-config.js';

const COLORS = { dot: 'p1', line2: 'p2', line3: 'p6', square2: 'p1', corner3: 'p4', line4: 'p2', rect: 'p5', l4: 'p3', t4: 'p7', s4: 'p4', line5: 'p6', square3: 'p3', bigl5: 'p5' };
// One hue and name per level, so the whole screen tells you where you are.
const THEMES = [
  [130, 'Meadow'], [165, 'Mint'], [190, 'Lagoon'], [215, 'Sky'], [250, 'Lavender'],
  [285, 'Orchid'], [325, 'Berry'], [355, 'Coral'], [22, 'Sunset'], [44, 'Gold'],
];
const color = (p) => `var(--${COLORS[p.family] || 'p2'})`;
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

let storage;
try { storage = window.localStorage; } catch { storage = null; }
const profiles = createProfiles(storage || { getItem: () => null, setItem() {}, removeItem() {} });
let settings = profiles.settings();
const feedback = createFeedback(() => settings);
// Family accounts are on once the Firebase config is filled in. The single-file preview has no cloud.js.
const cloudOn = !String(firebaseConfig.apiKey).startsWith('PASTE') && !document.documentElement.hasAttribute('data-preview');

const $ = (id) => document.getElementById(id);
const boardEl = $('board'), trayEl = $('tray');
let player = null, state = null, boardColors = Array(64).fill(null);

const cells = [];
for (let i = 0; i < 64; i++) { const d = document.createElement('div'); d.className = 'cell'; boardEl.appendChild(d); cells.push(d); }
THEMES.forEach(([h]) => { const i = document.createElement('i'); i.style.setProperty('--lh', h); $('levels').appendChild(i); });

// ---------- game screen ----------

function render() {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const el = cells[r * 8 + c];
    const f = isFilled(state.board, r, c);
    el.className = 'cell' + (f ? ' f' : '');
    el.style.background = f ? (boardColors[r * 8 + c] || 'var(--p2)') : '';
  }
  $('score').textContent = state.score;
  $('who').textContent = player.name;
  $('best').textContent = Math.max(state.score, profiles.best(player.id));
  $('lvl').textContent = state.level;
  applyTheme();
  const into = state.linesCleared % LINES_PER_LEVEL;
  if (state.level >= MAX_LEVEL) { $('lvlbar').style.width = '100%'; $('lvlhint').textContent = 'Top level'; }
  else {
    $('lvlbar').style.width = (100 * into / LINES_PER_LEVEL) + '%';
    const left = LINES_PER_LEVEL - into;
    $('lvlhint').textContent = `${left} line${left === 1 ? '' : 's'} to level ${state.level + 1}`;
  }
  renderTray();
}

function applyTheme() {
  const [h, name] = THEMES[state.level - 1];
  document.documentElement.style.setProperty('--h', h);
  $('lvlname').textContent = name;
  [...$('levels').children].forEach((el, i) => { el.className = i + 1 < state.level ? 'done' : i + 1 === state.level ? 'now' : ''; });
}

function pieceEl(p, size, gap) {
  const g = document.createElement('div');
  g.className = 'piece';
  g.style.setProperty('--s', size + 'px');
  g.style.gridTemplateColumns = `repeat(${p.width}, ${size}px)`;
  g.style.gap = gap + 'px';
  const set = new Set(p.cells.map(([r, c]) => r + ',' + c));
  for (let r = 0; r < p.height; r++) for (let c = 0; c < p.width; c++) {
    const i = document.createElement('i');
    if (set.has(r + ',' + c)) { i.className = 'f'; i.style.background = color(p); }
    g.appendChild(i);
  }
  return g;
}

function renderTray() {
  trayEl.innerHTML = '';
  const slotW = Math.min((trayEl.clientWidth - 20) / 3, trayEl.clientHeight);
  trayPieces(state).forEach((t, slot) => {
    const s = document.createElement('div');
    s.className = 'slot';
    s.dataset.slot = slot;
    if (!t.used) {
      const size = Math.max(8, Math.min(22, Math.floor((slotW - 16) / Math.max(t.piece.width, t.piece.height, 3)) - 2));
      s.appendChild(pieceEl(t.piece, size, Math.max(2, Math.round(size / 12))));
      s.setAttribute('aria-label', `Piece ${slot + 1}`);
    }
    trayEl.appendChild(s);
  });
}

// Dragging: the piece floats above the finger so it stays visible.
let drag = null;
const LIFT = 70, GAP = 3, PAD = 6;
function cellSize() { return (boardEl.clientWidth - 2 * PAD - 7 * GAP) / 8; }

trayEl.addEventListener('pointerdown', (e) => {
  if (drag || !e.isPrimary) return;
  const s = e.target.closest('.slot');
  if (!s || state.gameOver) return;
  const slot = Number(s.dataset.slot);
  const t = state.tray[slot];
  if (!t || t.used) return;
  e.preventDefault();
  const piece = trayPieces(state)[slot].piece;
  const size = cellSize();
  const ghost = pieceEl(piece, size, GAP);
  ghost.classList.add('ghost');
  document.body.appendChild(ghost);
  s.style.visibility = 'hidden';
  drag = { slot, piece, ghost, slotEl: s, size, target: null, pointerId: e.pointerId };
  try { trayEl.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
  feedback.pickUp();
  move(e);
});

function move(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { piece, ghost, size } = drag;
  const w = piece.width * size + (piece.width - 1) * GAP;
  const h = piece.height * size + (piece.height - 1) * GAP;
  const x = e.clientX - w / 2, y = e.clientY - h - LIFT;
  ghost.style.transform = `translate(${x}px, ${y}px)`;
  const b = boardEl.getBoundingClientRect();
  const step = size + GAP;
  const c = Math.round((x - b.left - PAD) / step), r = Math.round((y - b.top - PAD) / step);
  const target = canPlaceSlot(state, drag.slot, r, c) ? [r, c] : null;
  if (String(target) !== String(drag.target)) { drag.target = target; preview(); }
}

function preview() {
  for (const el of cells) el.classList.remove('ok', 'line');
  if (!drag || !drag.target) return;
  const [r, c] = drag.target;
  const test = cloneBoard(state.board);
  for (const [dr, dc] of drag.piece.cells) { cells[(r + dr) * 8 + c + dc].classList.add('ok'); test[r + dr] |= 1 << (c + dc); }
  for (let i = 0; i < 8; i++) {
    if (test[i] === FULL_ROW) for (let j = 0; j < 8; j++) cells[i * 8 + j].classList.add('line');
    if (test.every((row) => (row >> i) & 1)) for (let j = 0; j < 8; j++) cells[j * 8 + i].classList.add('line');
  }
}

function end(e) {
  if (!drag || (e && e.pointerId !== drag.pointerId)) return;
  const { slot, piece, ghost, slotEl, target } = drag;
  ghost.remove();
  slotEl.style.visibility = '';
  drag = null;
  preview();
  if (!target) return;
  const [r, c] = target;
  const col = color(piece);
  for (const [dr, dc] of piece.cells) boardColors[(r + dr) * 8 + c + dc] = col;
  const res = place(state, slot, r, c);
  if (!res.ok) return;
  for (const i of res.clearedRows) for (let j = 0; j < 8; j++) boardColors[i * 8 + j] = null;
  for (const j of res.clearedCols) for (let i = 0; i < 8; i++) boardColors[i * 8 + j] = null;
  save();
  render();
  for (const i of res.clearedRows) for (let j = 0; j < 8; j++) flash(i * 8 + j);
  for (const j of res.clearedCols) for (let i = 0; i < 8; i++) flash(i * 8 + j);
  const lines = res.clearedRows.length + res.clearedCols.length;
  if (lines) feedback.clear(lines); else feedback.place();
  if (res.levelUp && !res.gameOver) { toast(`Level ${state.level} · ${THEMES[state.level - 1][1]}`); feedback.levelUp(); }
  if (res.gameOver) setTimeout(gameOver, 350);
  if (reloadAfterDrag) { reloadAfterDrag = false; reloadGame(); }
}
function flash(i) { const el = cells[i]; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

trayEl.addEventListener('pointermove', move);
trayEl.addEventListener('pointerup', end);
trayEl.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pointerId) { drag.target = null; end(e); } });
trayEl.addEventListener('lostpointercapture', (e) => { if (drag && e.pointerId === drag.pointerId) end(e); });

function save() { if (player) { profiles.saveGame(player.id, state, boardColors); syncSoon(); } }

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text; t.hidden = false; t.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = 0; toastTimer = setTimeout(() => (t.hidden = true), 400); }, 1400);
}

// ---------- players ----------

function startAs(id) {
  player = profiles.setCurrent(id);
  const saved = profiles.loadGame(id);
  if (saved) { state = saved.state; boardColors = saved.colors; }
  else { state = newGame(); boardColors = Array(64).fill(null); save(); }
  hideCard();
  render();
  sync(id);
}

function restart() { state = newGame(); boardColors = Array(64).fill(null); save(); hideCard(); render(); }

// ---------- family accounts ----------
// Signing in is optional and per player. Play never waits for the network:
// the phone keeps everything, and sync.js merges with the account when online.

let cloudModule = null;
const cloud = () => (cloudModule ||= import('./cloud.js').catch((e) => { cloudModule = null; throw e; }));
const account = async (id) => (await cloud()).account(id);
const syncStatus = new Map();   // player id -> 'syncing' | sync.js status
const syncing = new Map();      // player id -> running sync, so syncs never overlap
let syncTimer = null, reloadAfterDrag = false, refreshCard = null;

const linked = (id) => cloudOn && !!profiles.players().find((p) => p.id === id)?.uid;

function sync(id = player?.id) {
  if (!linked(id)) return Promise.resolve();
  if (syncing.has(id)) return syncing.get(id);
  const run = (async () => {
    if (!navigator.onLine) { syncStatus.set(id, 'offline'); return; }
    if (!syncStatus.has(id)) syncStatus.set(id, 'syncing');
    let res;
    try { res = await syncPlayer(profiles, await account(id), id); }
    catch { res = { status: 'offline' }; }   // cloud.js or the Firebase SDK could not load
    syncStatus.set(id, res.status);
    if (res.gameChanged && player?.id === id) { if (drag) reloadAfterDrag = true; else reloadGame(); }
  })().finally(() => { syncing.delete(id); if (!$('overlay').hidden && refreshCard) refreshCard(); });
  syncing.set(id, run);
  return run;
}
// While playing, back up a little after the last move rather than after every move.
function syncSoon() { clearTimeout(syncTimer); if (linked(player?.id)) syncTimer = setTimeout(() => sync(), 15000); }

// The account had a newer saved game (or finished it on another phone).
function reloadGame() {
  if (!player || state.gameOver) return;
  const saved = profiles.loadGame(player.id);
  if (saved) { state = saved.state; boardColors = saved.colors; }
  else { state = newGame(); boardColors = Array(64).fill(null); profiles.saveGame(player.id, state, boardColors); }
  render();
}

const AUTH_ERRORS = {
  'auth/invalid-credential': 'That email and password don’t match.',
  'auth/wrong-password': 'That email and password don’t match.',
  'auth/user-not-found': 'No account with that email yet. Tap Create account.',
  'auth/invalid-email': 'That email doesn’t look right.',
  'auth/missing-password': 'Type a password.',
  'auth/weak-password': 'Use a password of at least 6 characters.',
  'auth/email-already-in-use': 'There is already an account with that email. Tap Sign in.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.',
  'auth/network-request-failed': 'No connection. Try again when you’re online.',
  'auth/operation-not-allowed': 'Email sign-in isn’t switched on in Firebase yet.',
};
const authError = (e) => AUTH_ERRORS[e?.code] || (navigator.onLine ? `Couldn’t sign in (${e?.code || 'unknown error'}).` : AUTH_ERRORS['auth/network-request-failed']);

const STATUS_TEXT = {
  syncing: 'Syncing…',
  ok: 'Scores and saved game are backed up.',
  offline: 'Offline. Syncs when you’re connected.',
  family: 'Not on the family list yet, so nothing is shared. Ask whoever set up the game to add this email.',
  signin: 'Signed out on this phone. Sign in again to keep syncing.',
  error: 'Couldn’t sync just now. It tries again on its own.',
};

function accountSection() {
  if (!cloudOn || !player) return '';
  const p = profiles.players().find((x) => x.id === player.id);
  if (!p?.uid) return `<h3>Family account</h3>
    <p class="hint">Sign in to back up ${esc(p.name)}’s scores and saved game and to see the family leaderboard. Optional: the game works the same without it.</p>
    <button type="button" id="signInBtn">Sign in or create account</button>`;
  const status = syncStatus.get(p.id) || (navigator.onLine ? 'syncing' : 'offline');
  return `<h3>Family account</h3>
    <div class="who-row"><span>${esc(p.email || 'Signed in')}<small>${STATUS_TEXT[status]}</small></span>
      ${status === 'signin' ? '<button type="button" class="quiet" id="signInBtn">Sign in</button>' : ''}
      <button type="button" class="quiet" id="signOutBtn">Sign out</button></div>`;
}

function showSignIn(id) {
  const p = profiles.players().find((x) => x.id === id);
  if (!p) return showSettings();
  showCard(`<h2>${esc(p.name)}’s account</h2>
    <p>One account per person. Use the same email and password on every phone ${esc(p.name)} plays on.</p>
    <form class="stack" id="authForm" autocomplete="on">
      <input type="email" id="emailIn" placeholder="Email" aria-label="Email" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(p.email || '')}">
      <input type="password" id="passIn" placeholder="Password" aria-label="Password" autocomplete="current-password">
      <p class="hint err" id="authMsg" role="status" hidden></p>
      <div class="row"><button type="button" id="signUpBtn">Create account</button><button class="primary" type="submit" id="goBtn">Sign in</button></div>
    </form>
    <div class="row"><button type="button" class="quiet" id="forgotBtn">Forgot password?</button><button type="button" class="quiet" id="cancelBtn">Cancel</button></div>`, showSettings);
  const msg = (text) => { $('authMsg').textContent = text; $('authMsg').hidden = !text; };
  const email = () => $('emailIn').value.trim().toLowerCase();
  const busy = (on) => { for (const b of ['goBtn', 'signUpBtn', 'forgotBtn']) $(b).disabled = on; };
  async function go(create) {
    msg('');
    busy(true);
    try {
      const acct = await account(id);
      const user = create ? await acct.signUp(email(), $('passIn').value) : await acct.signIn(email(), $('passIn').value);
      const other = profiles.byUid(user.uid);
      if (other && other.id !== id) {
        await acct.signOut();
        msg(`That account already belongs to ${other.name} on this phone.`);
        return;
      }
      profiles.link(id, user);
      syncStatus.set(id, 'syncing');
      $('passIn').blur();
      showSettings();
      sync(id);
    } catch (e) {
      msg(e?.code ? authError(e) : AUTH_ERRORS['auth/network-request-failed']);
    } finally {
      if ($('authForm')) busy(false);
    }
  }
  $('authForm').onsubmit = (e) => { e.preventDefault(); go(false); };
  on('signUpBtn', () => go(true));
  on('forgotBtn', async () => {
    if (!email()) { msg('Type your email first.'); $('emailIn').focus(); return; }
    try { await (await account(id)).resetPassword(email()); msg(`If there’s an account for ${email()}, an email to reset the password is on its way.`); }
    catch (e) { msg(authError(e)); }
  });
  on('cancelBtn', showSettings);
}

function showSignOut(id) {
  const p = profiles.players().find((x) => x.id === id);
  if (!p) return showSettings();
  showCard(`<h2>Sign out?</h2><p>${esc(p.name)}’s saved game and top 10 stay on this phone. The account keeps its copy, and signing in again merges them.</p>
    <div class="row"><button type="button" id="cancelBtn">Cancel</button><button class="primary" type="button" id="goBtn">Sign out</button></div>`, showSettings);
  on('cancelBtn', showSettings);
  on('goBtn', async () => {
    $('goBtn').disabled = true;
    // One last backup, but don't keep them waiting on a slow connection.
    await Promise.race([sync(id), new Promise((r) => setTimeout(r, 4000))]);
    signOut(id);
    showSettings();
  });
}

function signOut(id) {
  profiles.unlink(id);
  syncStatus.delete(id);
  account(id).then((a) => a.signOut()).catch(() => {});
}

// ---------- cards ----------

let onClose = null;
function showCard(html, close = null) {
  $('card').innerHTML = html;
  $('overlay').hidden = false;
  $('card').scrollTop = 0;
  onClose = close;
  refreshCard = null;
}
function hideCard() { $('overlay').hidden = true; onClose = null; refreshCard = null; }
$('overlay').addEventListener('click', (e) => { if (e.target === $('overlay') && onClose) onClose(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('overlay').hidden && onClose) onClose(); });
const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

function showPicker() {
  const list = profiles.playersByRecent();
  const canClose = !!player;
  const buttons = list.map((p) =>
    `<button type="button" data-id="${esc(p.id)}" class="${player && p.id === player.id ? 'primary' : ''}">
       <span>${esc(p.name)}</span><span class="num">${profiles.best(p.id) ? 'best ' + profiles.best(p.id) : ''}</span></button>`).join('');
  showCard(`<h2>${list.length ? 'Who’s playing?' : 'Welcome!'}</h2>
    ${list.length ? `<div class="players" id="plist">${buttons}</div>` : '<p>Add a name for each person who plays on this phone. Everyone gets their own saved game and top 10.</p>'}
    <h3>${list.length ? 'Add a player' : 'Your name'}</h3>
    <form class="row" id="addForm" autocomplete="off">
      <input type="text" id="nameIn" maxlength="${MAX_NAME}" placeholder="Name" aria-label="New player name" enterkeyhint="go" autocapitalize="words" spellcheck="false">
      <button class="${list.length ? '' : 'primary'}" type="submit" style="flex:none">Add</button>
    </form>
    ${canClose ? '<button type="button" class="quiet" id="closeBtn">Keep playing</button>' : ''}`,
  canClose ? hideCard : null);
  $('plist')?.addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) startAs(b.dataset.id); });
  $('addForm').onsubmit = (e) => {
    e.preventDefault();
    const p = profiles.addPlayer($('nameIn').value);
    if (!p) { $('nameIn').focus(); return; }
    $('nameIn').blur();
    startAs(p.id);
  };
  on('closeBtn', hideCard);
}

function scoresList(list, highlight) {
  if (!list.length) return '<p>No scores yet. Finish a game to get on the list.</p>';
  return '<ol class="scores">' + list.map((s, i) =>
    `<li class="${i === highlight ? 'me' : ''}"><span class="num">${i + 1}</span><span class="lv">level ${s.level}</span><span class="num">${s.score}</span></li>`
  ).join('') + '</ol>';
}

function familyBests() {
  const list = profiles.players().map((p) => ({ name: p.name, best: profiles.best(p.id) })).filter((p) => p.best).sort((a, b) => b.best - a.best);
  if (profiles.players().length < 2 || !list.length) return '';
  return `<h3>Family bests</h3><ol class="scores">${list.map((p, i) =>
    `<li><span class="num">${i + 1}</span><span>${esc(p.name)}</span><span class="num">${p.best}</span></li>`).join('')}</ol>`;
}

// Everyone signed in to the family's accounts, from the last time this phone was online.
function familyBoard() {
  const me = profiles.players().find((p) => p.id === player.id)?.uid;
  const list = profiles.board();
  if (!me || !list.length) return '';
  return `<h3>Family leaderboard</h3><ol class="scores">${list.map((r, i) =>
    `<li class="${r.uid === me ? 'me' : ''}"><span class="num">${i + 1}</span><span>${esc(r.name)}</span><span class="num">${r.best}</span></li>`).join('')}</ol>`;
}

function showScores(highlight = -1) {
  const p = profiles.players().find((x) => x.id === player.id);
  const where = linked(player.id) ? `Backed up to ${esc(p.email)}.` : 'Saved on this phone only.';
  showCard(`<h2>${esc(player.name)}’s top 10</h2>${scoresList(profiles.scores(player.id), highlight)}
    ${(linked(player.id) && familyBoard()) || familyBests()}
    <p class="hint">${where} Every set of three pieces fits in some order; finding it is the game.</p>
    <button type="button" id="closeBtn">Close</button>`, hideCard);
  on('closeBtn', hideCard);
  if (linked(player.id)) refreshCard = () => showScores(highlight);
}

function gameOver() {
  feedback.gameOver();
  const { rank } = profiles.addScore(player.id, { score: state.score, level: state.level });
  sync();
  const left = state.tray.filter((t) => !t.used).length;
  const why = `The ${left === 1 ? 'last piece no longer fits' : `last ${left} pieces no longer fit`} after that move.`;
  const note = rank === 0 && profiles.scores(player.id).length > 1 ? ' A new personal best!'
    : rank >= 0 ? ` That is number ${rank + 1} on your top 10.` : '';
  showCard(`<h2>${state.score} points</h2><p>${why}${note}</p>
    ${rank >= 0 ? scoresList(profiles.scores(player.id), rank) : ''}
    <button class="primary" id="againBtn" type="button">Play again</button>
    ${profiles.players().length > 1 ? '<button type="button" id="otherBtn">Change player</button>' : ''}`);
  on('againBtn', restart);
  on('otherBtn', () => { restart(); showPicker(); });
}

function confirmNewGame() {
  if (state.moves === 0 || state.gameOver) return restart();
  showCard(`<h2>Start a new game?</h2><p>This game ends and its ${state.score} points are not added to the scores.</p>
    <div class="row"><button id="keepBtn" type="button">Keep playing</button><button class="primary" id="goBtn" type="button">New game</button></div>`, hideCard);
  on('keepBtn', hideCard);
  on('goBtn', restart);
}

const sw = (id, label, sub, val) =>
  `<div class="set"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span>
   <button class="switch" id="${id}" type="button" role="switch" aria-checked="${val}" aria-label="${label}"></button></div>`;

function showSettings() {
  const t = settings.theme;
  const seg = (v, label) => `<button type="button" data-theme="${v}" aria-pressed="${t === v}">${label}</button>`;
  const rows = profiles.playersByRecent().map((p) =>
    `<div class="who-row"><span>${esc(p.name)}</span>
      <button type="button" class="quiet" data-rename="${esc(p.id)}">Rename</button>
      <button type="button" class="quiet" data-remove="${esc(p.id)}">Remove</button></div>`).join('');
  showCard(`<h2>Settings</h2>
    ${sw('soundSw', 'Sound', 'Soft tones. The silent switch may mute them.', settings.sound)}
    ${sw('hapticSw', 'Vibration', 'A light tap when pieces land.', settings.haptics)}
    <h3>Look</h3>
    <div class="seg" id="themeSeg">${seg('auto', 'Auto')}${seg('light', 'Light')}${seg('dark', 'Dark')}</div>
    <h3>Players on this phone</h3>
    <div id="prows">${rows}</div>
    <button type="button" id="addBtn">Add or change player</button>
    ${accountSection()}
    <p class="hint">${cloudOn ? 'Games and scores stay on this phone unless a player signs in to a family account. No ads, no tracking.'
      : 'Games and scores stay on this phone. No accounts, no ads, nothing is sent anywhere.'}</p>
    <button class="primary" type="button" id="closeBtn">Done</button>`, hideCard);
  on('soundSw', () => { settings = profiles.saveSettings({ sound: !settings.sound }); showSettings(); feedback.test(); });
  on('hapticSw', () => { settings = profiles.saveSettings({ haptics: !settings.haptics }); showSettings(); feedback.test(); });
  $('themeSeg').onclick = (e) => {
    const b = e.target.closest('button[data-theme]');
    if (!b) return;
    settings = profiles.saveSettings({ theme: b.dataset.theme });
    applySettings();
    showSettings();
  };
  $('prows').onclick = (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.rename) showRename(b.dataset.rename);
    if (b?.dataset.remove) showRemove(b.dataset.remove);
  };
  on('addBtn', showPicker);
  on('signInBtn', () => showSignIn(player.id));
  on('signOutBtn', () => showSignOut(player.id));
  on('closeBtn', hideCard);
  if (linked(player?.id)) refreshCard = showSettings;
}

function showRename(id) {
  const p = profiles.players().find((x) => x.id === id);
  if (!p) return showSettings();
  showCard(`<h2>Rename ${esc(p.name)}</h2>
    <form id="renForm" autocomplete="off" style="display:contents">
      <input type="text" id="nameIn" maxlength="${MAX_NAME}" value="${esc(p.name)}" aria-label="New name" enterkeyhint="done" autocapitalize="words" spellcheck="false">
      <p class="hint" id="renHint" hidden>That name is already taken on this phone.</p>
      <div class="row"><button type="button" id="cancelBtn">Cancel</button><button class="primary" type="submit">Save</button></div>
    </form>`, showSettings);
  $('renForm').onsubmit = (e) => {
    e.preventDefault();
    if (!profiles.renamePlayer(id, $('nameIn').value)) { $('renHint').hidden = false; return; }
    if (player?.id === id) { player = profiles.current(); render(); }
    showSettings();
  };
  on('cancelBtn', showSettings);
}

function showRemove(id) {
  const p = profiles.players().find((x) => x.id === id);
  if (!p) return showSettings();
  const kept = linked(id) ? ` Their family account (${esc(p.email)}) keeps its copy.` : ' This cannot be undone.';
  showCard(`<h2>Remove ${esc(p.name)}?</h2><p>Their saved game and top 10 are deleted from this phone.${kept}</p>
    <div class="row"><button type="button" id="cancelBtn">Cancel</button><button class="primary" type="button" id="goBtn">Remove</button></div>`, showSettings);
  on('cancelBtn', showSettings);
  on('goBtn', () => {
    if (linked(id)) signOut(id);
    profiles.removePlayer(id);
    if (player?.id === id) { player = null; showPicker(); } else showSettings();
  });
}

function applySettings() {
  if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = settings.theme;
}

on('scoresBtn', () => showScores());
on('newBtn', confirmNewGame);
on('settingsBtn', showSettings);
on('whoBtn', showPicker);

// ---------- iPhone behaviour ----------

// No pinch zoom, double-tap zoom or page drag; only the cards scroll.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1 || !e.target.closest?.('.card')) e.preventDefault();
}, { passive: false });
document.addEventListener('pointerdown', () => feedback.unlock(), true);
addEventListener('resize', () => { if (state) renderTray(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { save(); clearTimeout(syncTimer); sync(); }
  else sync();
});
addEventListener('online', () => sync());
// Ask the phone to keep our storage. Home Screen apps are kept anyway; this helps in a browser tab.
navigator.storage?.persist?.().catch(() => {});
// Offline support. The single-file preview has no sw.js, so a failure here is expected there.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------- start ----------

applySettings();
profiles.migrateLegacy();
const last = profiles.current();
if (last) {
  startAs(last.id);
  // On a shared phone, ask who is playing each time the app opens.
  if (profiles.players().length > 1) showPicker();
} else {
  state = newGame();
  player = { id: null, name: '' };
  render();
  player = null;
  showPicker();
}
