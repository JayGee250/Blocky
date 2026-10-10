// Family players, their saved games, game history and top 10s, and the phone's settings.
// Everything lives in localStorage on this phone. A player can also be linked
// to a family account (app/sync.js copies their data to and from Firebase), but
// this file never touches the network.
// `storage` is anything with getItem/setItem/removeItem, so tests can pass a fake.
import { MAX_LEVEL } from '../engine/difficulty.js';

export const MAX_SCORES = 10;
export const MAX_NAME = 16;
export const MAX_HISTORY = 500;
export const DEFAULT_SETTINGS = Object.freeze({ sound: false, haptics: false, theme: 'auto' });

const PLAYERS = 'bb-players', CURRENT = 'bb-current', SETTINGS = 'bb-settings', MIGRATED = 'bb-migrated', BOARD = 'bb-board', FAMILY = 'bb-family';
// Keys used by the single-player test page, moved into players on first run.
const LEGACY = { game: 'bb-game', colors: 'bb-game-colors', scores: 'bb-scores', name: 'bb-name' };

// History order: newest game first (the same order sync.js merges into).
export const newestFirst = (a, b) => b.start - a.start || (a.id < b.id ? -1 : 1);

export function cleanName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

export function createProfiles(storage) {
  const get = (k, d) => { try { const v = storage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const set = (k, v) => { try { storage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const del = (k) => { try { storage.removeItem(k); } catch { /* storage unavailable */ } };
  const key = (id, what) => `bb-p-${id}-${what}`;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function players() {
    const list = get(PLAYERS, []);
    return Array.isArray(list) ? list : [];
  }
  const savePlayers = (list) => set(PLAYERS, list);
  const find = (id) => players().find((p) => p.id === id) || null;
  const byName = (name) => players().find((p) => p.name.toLowerCase() === name.toLowerCase()) || null;

  // Adding a name that already exists returns that player instead of a twin.
  function addPlayer(name) {
    const clean = cleanName(name);
    if (!clean) return null;
    const existing = byName(clean);
    if (existing) return existing;
    const p = { id: newId(), name: clean, lastPlayed: 0 };
    savePlayers([...players(), p]);
    return p;
  }

  function renamePlayer(id, name) {
    const clean = cleanName(name);
    const other = clean && byName(clean);
    if (!clean || (other && other.id !== id)) return false;
    const list = players();
    const p = list.find((x) => x.id === id);
    if (!p) return false;
    p.name = clean;
    return savePlayers(list);
  }

  function removePlayer(id) {
    savePlayers(players().filter((p) => p.id !== id));
    for (const what of ['game', 'colors', 'scores', 'gameAt', 'synced', 'history', 'start']) del(key(id, what));
    if (get(CURRENT, null) === id) del(CURRENT);
  }

  // Most recently played first, so the usual player is on top of the picker.
  function playersByRecent() {
    return players().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.name.localeCompare(b.name));
  }

  function current() { return find(get(CURRENT, null)); }
  function setCurrent(id) {
    const list = players();
    const p = list.find((x) => x.id === id);
    if (!p) return null;
    p.lastPlayed = Date.now();
    savePlayers(list);
    set(CURRENT, id);
    return p;
  }

  function loadGame(id) {
    const state = get(key(id, 'game'), null);
    if (!state || state.gameOver || !Array.isArray(state.board) || !Array.isArray(state.tray)) return null;
    const colors = get(key(id, 'colors'), null);
    return { state, colors: Array.isArray(colors) && colors.length === 64 ? colors : Array(64).fill(null) };
  }
  // gameAt is when the saved game last changed, so two phones signed in to the
  // same account keep the newer one. A fresh game nobody has moved in keeps the
  // old time, so it never replaces a game in progress on another phone.
  // Saving a game someone has moved in also keeps its line in the history.
  function saveGame(id, state, colors, at = state.moves > 0 ? Date.now() : gameAt(id)) {
    if (state.moves > 0) recordGame(id, state);
    return set(key(id, 'game'), state) && set(key(id, 'colors'), colors) && set(key(id, 'gameAt'), at);
  }
  function gameAt(id) { return Number(get(key(id, 'gameAt'), 0)) || 0; }
  // Another phone finished or abandoned the game at time `at`.
  function clearGame(id, at) { del(key(id, 'game')); del(key(id, 'colors')); set(key(id, 'gameAt'), at); }

  // ---------- history: every game played, one entry per game ----------
  // { id, start, end, score, startLevel, level, status, at, deleted? }
  // status is 'playing', 'over' (lost) or 'abandoned' (replaced by a new game);
  // end is null while playing. `at` is when the entry last changed, for merging
  // phones. A deleted entry stays as a marker so other phones drop it too.
  function allHistory(id) {
    const list = get(key(id, 'history'), []);
    return Array.isArray(list) ? list : [];
  }
  function setHistory(id, list) {
    return set(key(id, 'history'), [...list].sort(newestFirst).slice(0, MAX_HISTORY));
  }
  // Newest first, without deleted entries.
  function history(id) { return allHistory(id).filter((e) => !e.deleted); }
  function updateEntry(id, gid, fn) {
    const list = allHistory(id);
    const e = list.find((x) => x.id === gid);
    if (!e || !fn(e)) return null;
    e.at = Date.now();
    setHistory(id, list);
    return e;
  }

  // A game gets its id and start time with its first move, so a game nobody
  // played never shows up.
  function recordGame(id, state) {
    if (!state.gid) { state.gid = newId(); state.started = Date.now(); }
    const list = allHistory(id);
    let e = list.find((x) => x.id === state.gid);
    if (e?.deleted || (e && e.status !== 'playing')) return e;
    const status = state.gameOver ? 'over' : 'playing';
    if (e && e.score === state.score && e.level === state.level && e.status === status) return e;
    if (!e) {
      e = { id: state.gid, start: state.started || Date.now(), startLevel: state.startLevel || 1 };
      list.push(e);
    }
    Object.assign(e, { score: state.score, level: state.level, status, end: state.gameOver ? Date.now() : null, at: Date.now() });
    setHistory(id, list);
    return e;
  }
  // The game in progress was replaced by a new one.
  function abandonGame(id, gid, at = Date.now()) {
    return updateEntry(id, gid, (e) => e.status === 'playing' && Object.assign(e, { status: 'abandoned', end: at }));
  }
  function deleteGame(id, gid) {
    return updateEntry(id, gid, (e) => !e.deleted && Object.assign(e, { deleted: true }));
  }

  // The highest level this player has reached in any game: they may start at any level up to it.
  function reached(id) {
    const g = get(key(id, 'game'), null);
    const levels = [1, g?.level || 1, ...scores(id).map((s) => s.level || 1), ...allHistory(id).map((e) => e.level || 1)];
    return Math.min(MAX_LEVEL, Math.max(...levels.map(Number).filter(Number.isFinite)));
  }
  // The start level the player picked last time, never above what they have reached.
  function startLevel(id) { return Math.min(Math.max(1, Number(get(key(id, 'start'), 1)) || 1), reached(id)); }
  function setStartLevel(id, level) { set(key(id, 'start'), level); }

  // Top 10 games, optionally only those started at `start`. Comes from the
  // stored top 10 (which also holds scores from before the history existed,
  // counted as started at level 1) plus finished games in the history.
  function top(id, start = null) {
    const gone = new Set(allHistory(id).filter((e) => e.deleted).map((e) => e.id));
    const fromHistory = history(id).filter((e) => e.status === 'over' && e.score > 0)
      .map((e) => ({ score: e.score, level: e.level, startLevel: e.startLevel || 1, date: e.end, gid: e.id }));
    const seen = new Set();
    return [...scores(id), ...fromHistory]
      .filter((s) => !(s.gid && gone.has(s.gid)) && (start == null || (s.startLevel || 1) === start))
      .filter((s) => { const k = s.gid || `${s.score}|${s.level}|${s.date}`; return !seen.has(k) && seen.add(k); })
      .sort((a, b) => b.score - a.score || a.date - b.date)
      .slice(0, MAX_SCORES);
  }

  function scores(id) {
    const list = get(key(id, 'scores'), []);
    return Array.isArray(list) ? list : [];
  }
  function qualifies(id, score) {
    const list = scores(id);
    return score > 0 && (list.length < MAX_SCORES || score > list[list.length - 1].score);
  }
  // Returns the new list and the entry's place in it (-1 if it did not make the top 10).
  function addScore(id, { score, level, date = Date.now(), startLevel = 1, gid }) {
    if (!qualifies(id, score)) return { list: scores(id), rank: -1 };
    const entry = { score, level, date, startLevel, ...(gid ? { gid } : {}) };
    const list = [...scores(id), entry].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, MAX_SCORES);
    set(key(id, 'scores'), list);
    return { list, rank: list.indexOf(entry) };
  }
  function best(id) { return scores(id)[0]?.score || 0; }
  function setScores(id, list) { return set(key(id, 'scores'), list.slice(0, MAX_SCORES)); }

  // Family account link: the account's uid and email live on the player.
  function link(id, { uid, email }) {
    const list = players();
    const p = list.find((x) => x.id === id);
    if (!p || list.some((x) => x.uid === uid && x.id !== id)) return null;
    Object.assign(p, { uid, email });
    savePlayers(list);
    return p;
  }
  function unlink(id) {
    const list = players();
    const p = list.find((x) => x.id === id);
    if (!p) return;
    delete p.uid; delete p.email;
    savePlayers(list);
    del(key(id, 'synced'));
  }
  const byUid = (uid) => players().find((p) => p.uid === uid) || null;
  // What was last written to the account, so unchanged data is not written again.
  function synced(id) { return get(key(id, 'synced'), {}); }
  function setSynced(id, mark) { set(key(id, 'synced'), mark); }

  // Last family leaderboard fetched, shown when offline.
  function board() { const b = get(BOARD, []); return Array.isArray(b) ? b : []; }
  function saveBoard(list) { set(BOARD, list); }
  // Last family histories fetched: [{ uid, name, games }], shown when offline.
  function family() { const f = get(FAMILY, []); return Array.isArray(f) ? f : []; }
  function saveFamily(list) { set(FAMILY, list); }

  function settings() { return { ...DEFAULT_SETTINGS, ...get(SETTINGS, {}) }; }
  function saveSettings(patch) { const next = { ...settings(), ...patch }; set(SETTINGS, next); return next; }

  // The test page kept one game and one shared top 10 with a name per score.
  // Each name becomes a player with their own scores; the game goes to the
  // last name typed. Runs once; the old keys are left in place.
  function migrateLegacy() {
    if (get(MIGRATED, false) || players().length) return false;
    set(MIGRATED, true);
    const oldScores = get(LEGACY.scores, []);
    const lastName = cleanName(get(LEGACY.name, ''));
    const game = get(LEGACY.game, null);
    const hasGame = game && !game.gameOver && game.moves > 0;
    if (!Array.isArray(oldScores) || (!oldScores.length && !hasGame)) return false;
    const nameOf = (s) => cleanName(s.name) || 'Player 1';
    const names = [lastName, ...oldScores.map(nameOf)].filter(Boolean);
    if (!names.length) names.push('Player 1');
    // addPlayer matches names regardless of case, so "Mia" and "mia" share a player.
    const mine = new Map();
    for (const name of names) mine.set(addPlayer(name).id, []);
    for (const s of oldScores) mine.get(byName(nameOf(s)).id).push({ score: s.score, level: s.level, date: s.date || 0 });
    for (const [id, list] of mine) {
      if (list.length) set(key(id, 'scores'), list.sort((a, b) => b.score - a.score).slice(0, MAX_SCORES));
    }
    const owner = byName(lastName || names[0]);
    if (hasGame) saveGame(owner.id, game, get(LEGACY.colors, Array(64).fill(null)));
    setCurrent(owner.id);
    return true;
  }

  return {
    players, playersByRecent, addPlayer, renamePlayer, removePlayer, current, setCurrent,
    loadGame, saveGame, gameAt, clearGame, scores, qualifies, addScore, best, setScores, settings, saveSettings, migrateLegacy,
    link, unlink, byUid, synced, setSynced, board, saveBoard, family, saveFamily,
    history, allHistory, setHistory, recordGame, abandonGame, deleteGame, reached, startLevel, setStartLevel, top,
  };
}
