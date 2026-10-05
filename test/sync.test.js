import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfiles } from '../app/profiles.js';
import { mergeScores, remoteGameWins, syncPlayer, statusFor } from '../app/sync.js';
import { newGame, place, canPlaceSlot } from '../engine/index.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

// Stands in for cloud.js: one account's documents, kept in memory.
function fakeAccount(uid, cloud = { users: {}, board: {} }) {
  const writes = [];
  return {
    cloud, writes,
    user: async () => ({ uid, email: uid + '@example.com' }),
    pull: async () => cloud.users[uid] ? structuredClone(cloud.users[uid]) : null,
    push: async (doc) => { writes.push('doc'); cloud.users[uid] = structuredClone(doc); },
    pushRow: async (row) => { writes.push('row'); cloud.board[uid] = { uid, ...row }; },
    board: async () => Object.values(cloud.board).sort((a, b) => b.best - a.best),
  };
}

function playedGame(seed) {
  const g = newGame({ seed });
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!g.moves && canPlaceSlot(g, 0, r, c)) place(g, 0, r, c);
  return g;
}

test('scores merge into one top 10 without counting the same game twice', () => {
  const a = [{ score: 50, level: 2, date: 1 }, { score: 30, level: 1, date: 2 }];
  const b = [{ score: 50, level: 2, date: 1 }, { score: 40, level: 2, date: 3 }, { score: 0, level: 1, date: 4 }];
  assert.deepEqual(mergeScores(a, b).map((s) => s.score), [50, 40, 30]);
  const many = Array.from({ length: 15 }, (_, i) => ({ score: i + 1, level: 1, date: i }));
  assert.equal(mergeScores(many, []).length, 10);
  assert.equal(mergeScores(many, [])[0].score, 15);
  assert.deepEqual(mergeScores(null, undefined), []);
});

test('the newer saved game wins, the phone keeps its own on a tie', () => {
  assert.equal(remoteGameWins(5, 6), true);
  assert.equal(remoteGameWins(6, 6), false);
  assert.equal(remoteGameWins(0, undefined), false);
});

test('first sign-in merges local scores into the account and backs up the game', async () => {
  const pr = createProfiles(memoryStorage());
  const mia = pr.addPlayer('Mia');
  pr.addScore(mia.id, { score: 80, level: 3, date: 10 });
  pr.saveGame(mia.id, playedGame(1), Array(64).fill(null));
  const acct = fakeAccount('u1');
  acct.cloud.users.u1 = { name: 'Mia', scores: [{ score: 120, level: 4, date: 5 }], game: null, gameAt: 0 };
  pr.link(mia.id, { uid: 'u1', email: 'mia@example.com' });

  const res = await syncPlayer(pr, acct, mia.id);
  assert.equal(res.status, 'ok');
  assert.equal(res.gameChanged, false);
  assert.deepEqual(pr.scores(mia.id).map((s) => s.score), [120, 80]);
  assert.deepEqual(acct.cloud.users.u1.scores.map((s) => s.score), [120, 80]);
  assert.equal(JSON.parse(acct.cloud.users.u1.game).state.moves, 1);
  assert.equal(acct.cloud.board.u1.best, 120);
  assert.equal(pr.board()[0].name, 'Mia');

  // Nothing changed, so a second sync writes nothing.
  acct.writes.length = 0;
  await syncPlayer(pr, acct, mia.id);
  assert.deepEqual(acct.writes, []);
});

test('a new phone picks up the game in progress, and a finished game clears it', async () => {
  const cloud = { users: {}, board: {} };
  const phoneA = createProfiles(memoryStorage()), phoneB = createProfiles(memoryStorage());
  const a = phoneA.addPlayer('Tom'), b = phoneB.addPlayer('Tom');
  phoneA.link(a.id, { uid: 'u2', email: 't@example.com' });
  phoneB.link(b.id, { uid: 'u2', email: 't@example.com' });
  const game = playedGame(7);
  phoneA.saveGame(a.id, game, Array(64).fill('red'));
  await syncPlayer(phoneA, fakeAccount('u2', cloud), a.id);

  // Phone B opens Tom with a fresh, untouched game: the game in progress wins.
  phoneB.saveGame(b.id, newGame({ seed: 2 }), Array(64).fill(null));
  const res = await syncPlayer(phoneB, fakeAccount('u2', cloud), b.id);
  assert.equal(res.gameChanged, true);
  assert.deepEqual(phoneB.loadGame(b.id).state, game);
  assert.equal(phoneB.loadGame(b.id).colors[0], 'red');

  // Phone B finishes it; phone A learns there is no game to resume.
  const done = { ...game, gameOver: true, moves: game.moves + 1 };
  phoneB.saveGame(b.id, done, Array(64).fill(null), phoneB.gameAt(b.id) + 1);
  await syncPlayer(phoneB, fakeAccount('u2', cloud), b.id);
  assert.equal(cloud.users.u2.game, null);
  const back = await syncPlayer(phoneA, fakeAccount('u2', cloud), a.id);
  assert.equal(back.gameChanged, true);
  assert.equal(phoneA.loadGame(a.id), null);
});

test('sync reports why it could not run', async () => {
  const pr = createProfiles(memoryStorage());
  const p = pr.addPlayer('Ana');
  pr.link(p.id, { uid: 'u3', email: 'a@example.com' });
  const denied = { ...fakeAccount('u3'), pull: async () => { throw Object.assign(new Error('no'), { code: 'permission-denied' }); } };
  assert.equal((await syncPlayer(pr, denied, p.id)).status, 'family');
  assert.equal((await syncPlayer(pr, { ...fakeAccount('u3'), user: async () => null }, p.id)).status, 'signin');
  assert.equal(statusFor({ code: 'unavailable' }), 'offline');
  assert.equal(statusFor(new TypeError('Failed to fetch')), 'offline');
  // A player who is not signed in is left alone.
  const q = pr.addPlayer('Bo');
  assert.equal((await syncPlayer(pr, fakeAccount('x'), q.id)).status, 'ok');
});

test('an account links to one player per phone, and unlinking keeps the data', () => {
  const pr = createProfiles(memoryStorage());
  const a = pr.addPlayer('A'), b = pr.addPlayer('B');
  assert.ok(pr.link(a.id, { uid: 'u', email: 'a@x.com' }));
  assert.equal(pr.link(b.id, { uid: 'u', email: 'a@x.com' }), null);
  assert.equal(pr.byUid('u').id, a.id);
  pr.addScore(a.id, { score: 5, level: 1 });
  pr.unlink(a.id);
  assert.equal(pr.byUid('u'), null);
  assert.equal(pr.best(a.id), 5);
});

test('an untouched new game keeps the old save time', () => {
  const pr = createProfiles(memoryStorage());
  const p = pr.addPlayer('C');
  pr.saveGame(p.id, playedGame(3), Array(64).fill(null), 1234);
  pr.saveGame(p.id, newGame({ seed: 4 }), Array(64).fill(null));
  assert.equal(pr.gameAt(p.id), 1234);
  pr.saveGame(p.id, playedGame(5), Array(64).fill(null));
  assert.ok(pr.gameAt(p.id) > 1234);
});
