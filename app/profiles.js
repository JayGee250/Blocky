// Family players, their saved games and top 10s, and the phone's settings.
// Everything lives in localStorage on this phone. A player can also be linked
// to a family account (app/sync.js copies their data to and from Firebase), but
// this file never touches the network.
// `storage` is anything with getItem/setItem/removeItem, so tests can pass a fake.

export const MAX_SCORES = 10;
export const MAX_NAME = 16;
export const DEFAULT_SETTINGS = Object.freeze({ sound: false, haptics: false, theme: 'auto' });

const PLAYERS = 'bb-players', CURRENT = 'bb-current', SETTINGS = 'bb-settings', MIGRATED = 'bb-migrated', BOARD = 'bb-board';
// Keys used by the single-player test page, moved into players on first run.
const LEGACY = { game: 'bb-game', colors: 'bb-game-colors', scores: 'bb-scores', name: 'bb-name' };

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
    for (const what of ['game', 'colors', 'scores', 'gameAt', 'synced']) del(key(id, what));
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
  function saveGame(id, state, colors, at = state.moves > 0 ? Date.now() : gameAt(id)) {
    return set(key(id, 'game'), state) && set(key(id, 'colors'), colors) && set(key(id, 'gameAt'), at);
  }
  function gameAt(id) { return Number(get(key(id, 'gameAt'), 0)) || 0; }
  // Another phone finished or abandoned the game at time `at`.
  function clearGame(id, at) { del(key(id, 'game')); del(key(id, 'colors')); set(key(id, 'gameAt'), at); }

  function scores(id) {
    const list = get(key(id, 'scores'), []);
    return Array.isArray(list) ? list : [];
  }
  function qualifies(id, score) {
    const list = scores(id);
    return score > 0 && (list.length < MAX_SCORES || score > list[list.length - 1].score);
  }
  // Returns the new list and the entry's place in it (-1 if it did not make the top 10).
  function addScore(id, { score, level, date = Date.now() }) {
    if (!qualifies(id, score)) return { list: scores(id), rank: -1 };
    const entry = { score, level, date };
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
    link, unlink, byUid, synced, setSynced, board, saveBoard,
  };
}
