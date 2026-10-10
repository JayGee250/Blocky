// Copies a signed-in player's data between this phone and their family account.
// The phone stays the source of truth: play never waits for the network, and a
// sync is a merge that is safe to repeat, so a failed one is simply tried again.
//
// Account data in Firestore (see firestore.rules):
//   users/{uid}        name, scores (top 10), game (saved game as JSON or null), gameAt, updatedAt
//   leaderboard/{uid}  name, best, level, date, updatedAt: one row per family member
//   history/{uid}      name, games (every game, see profiles.js), updatedAt: readable by the whole family

import { MAX_SCORES, MAX_HISTORY, newestFirst } from './profiles.js';

// Top 10 from both lists. The same game shows up in both after the first sync,
// so entries with the same score, level and time count once.
export function mergeScores(a, b) {
  const seen = new Set();
  return [...(a || []), ...(b || [])]
    .filter((s) => s && Number.isFinite(s.score) && s.score > 0)
    .map((s) => ({ score: s.score, level: s.level || 1, date: s.date || 0, startLevel: s.startLevel || 1, ...(s.gid ? { gid: s.gid } : {}) }))
    .filter((s) => { const k = s.gid || `${s.score}|${s.level}|${s.date}`; return !seen.has(k) && seen.add(k); })
    .sort((x, y) => y.score - x.score || x.date - y.date)
    .slice(0, MAX_SCORES);
}

// Every game from both lists, one entry per game id. For the same game a
// deletion beats an ended game, which beats one still in progress; otherwise
// the entry that changed last wins. Newest games first, at most MAX_HISTORY.
const weight = (e) => (e.deleted ? 3 : e.status === 'playing' ? 1 : 2);
export function mergeHistory(a, b) {
  const byId = new Map();
  for (const e of [...(a || []), ...(b || [])]) {
    if (!e || typeof e.id !== 'string' || !Number.isFinite(e.start)) continue;
    const old = byId.get(e.id);
    if (!old || weight(e) > weight(old) || (weight(e) === weight(old) && (e.at || 0) > (old.at || 0))) byId.set(e.id, e);
  }
  return [...byId.values()].sort(newestFirst).slice(0, MAX_HISTORY);
}

// The saved game that changed last wins, including "no game" when the other
// phone finished it. On a tie the phone's own game stays.
export const remoteGameWins = (localAt, remoteAt) => (remoteAt || 0) > (localAt || 0);

// Firestore hands maps back with their keys in its own order, so compare by content.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
export const same = (a, b) => canon(a) === canon(b);

// One sync for one linked player. `account` is cloud.js's account for that player.
// Returns { status, gameChanged } where status is 'ok', 'offline', 'signin'
// (the account signed out, for example the password was changed), 'family'
// (the account is not on the family list yet) or 'error'.
export async function syncPlayer(profiles, account, playerId) {
  const player = profiles.players().find((p) => p.id === playerId);
  if (!player?.uid) return { status: 'ok', gameChanged: false };
  try {
    const user = await account.user();
    if (!user || user.uid !== player.uid) return { status: 'signin', gameChanged: false };
    const remote = (await account.pull()) || {};

    const localScores = profiles.scores(playerId);
    const scores = mergeScores(localScores, remote.scores);
    if (!same(scores, localScores)) profiles.setScores(playerId, scores);

    // The history first, so a game that ended on another phone is not marked abandoned here.
    const family = await account.histories();
    const mine = family.find((h) => h.uid === player.uid);
    const localHistory = profiles.allHistory(playerId);
    const games = mergeHistory(localHistory, mine?.games);
    if (!same(games, localHistory)) profiles.setHistory(playerId, games);

    let gameChanged = false;
    if (remoteGameWins(profiles.gameAt(playerId), remote.gameAt)) {
      const old = profiles.loadGame(playerId)?.state;
      const saved = parseGame(remote.game);
      if (saved) profiles.saveGame(playerId, saved.state, saved.colors, remote.gameAt);
      else profiles.clearGame(playerId, remote.gameAt);
      // This phone's game in progress gave way to a newer one from another phone.
      if (old?.gid && old.gid !== saved?.state.gid) profiles.abandonGame(playerId, old.gid, remote.gameAt);
      gameChanged = true;
    }

    const local = profiles.loadGame(playerId);
    const doc = {
      name: player.name,
      scores,
      game: local ? JSON.stringify(local) : null,
      gameAt: profiles.gameAt(playerId),
    };
    const top = scores[0];
    const row = top ? { name: player.name, best: top.score, level: top.level, date: top.date } : null;
    const sameDoc = remote.name === doc.name && remote.game === doc.game && remote.gameAt === doc.gameAt && same(remote.scores, scores);
    if (!sameDoc) await account.push(doc);
    // The leaderboard row is not read back, so remember what was last written.
    const rowKey = JSON.stringify(row);
    if (row && profiles.synced(playerId).row !== rowKey) await account.pushRow(row);
    const finalGames = profiles.allHistory(playerId);
    if (mine?.name !== player.name || !same(mine?.games || [], finalGames)) {
      await account.pushHistory({ name: player.name, games: finalGames });
    }
    profiles.setSynced(playerId, { row: rowKey, at: Date.now() });

    profiles.saveFamily(family.filter((h) => h.uid !== player.uid).concat({ uid: player.uid, name: player.name, games: finalGames }));
    profiles.saveBoard(await account.board());
    return { status: 'ok', gameChanged };
  } catch (e) {
    return { status: statusFor(e), gameChanged: false, error: e };
  }
}

function parseGame(json) {
  try {
    const g = typeof json === 'string' ? JSON.parse(json) : null;
    return g && g.state && Array.isArray(g.state.board) && Array.isArray(g.colors) ? g : null;
  } catch { return null; }
}

export function statusFor(e) {
  const code = String(e?.code || '');
  if (code.endsWith('permission-denied')) return 'family';
  if (code.endsWith('unavailable') || code.endsWith('network-request-failed') || e?.name === 'TypeError') return 'offline';
  if (code.endsWith('unauthenticated') || code.endsWith('user-token-expired') || code.endsWith('user-disabled')) return 'signin';
  return 'error';
}
