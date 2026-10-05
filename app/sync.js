// Copies a signed-in player's data between this phone and their family account.
// The phone stays the source of truth: play never waits for the network, and a
// sync is a merge that is safe to repeat, so a failed one is simply tried again.
//
// Account data in Firestore (see firestore.rules):
//   users/{uid}        name, scores (top 10), game (saved game as JSON or null), gameAt, updatedAt
//   leaderboard/{uid}  name, best, level, date, updatedAt: one row per family member

import { MAX_SCORES } from './profiles.js';

// Top 10 from both lists. The same game shows up in both after the first sync,
// so entries with the same score, level and time count once.
export function mergeScores(a, b) {
  const seen = new Set();
  return [...(a || []), ...(b || [])]
    .filter((s) => s && Number.isFinite(s.score) && s.score > 0)
    .map((s) => ({ score: s.score, level: s.level || 1, date: s.date || 0 }))
    .filter((s) => { const k = `${s.score}|${s.level}|${s.date}`; return !seen.has(k) && seen.add(k); })
    .sort((x, y) => y.score - x.score || x.date - y.date)
    .slice(0, MAX_SCORES);
}

// The saved game that changed last wins, including "no game" when the other
// phone finished it. On a tie the phone's own game stays.
export const remoteGameWins = (localAt, remoteAt) => (remoteAt || 0) > (localAt || 0);

const sameScores = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
    if (!sameScores(scores, localScores)) profiles.setScores(playerId, scores);

    let gameChanged = false;
    if (remoteGameWins(profiles.gameAt(playerId), remote.gameAt)) {
      const saved = parseGame(remote.game);
      if (saved) profiles.saveGame(playerId, saved.state, saved.colors, remote.gameAt);
      else profiles.clearGame(playerId, remote.gameAt);
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
    const sameDoc = remote.name === doc.name && remote.game === doc.game && remote.gameAt === doc.gameAt && sameScores(remote.scores, scores);
    if (!sameDoc) await account.push(doc);
    // The leaderboard row is not read back, so remember what was last written.
    const rowKey = JSON.stringify(row);
    if (row && profiles.synced(playerId).row !== rowKey) await account.pushRow(row);
    profiles.setSynced(playerId, { row: rowKey, at: Date.now() });

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
