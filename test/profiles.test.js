import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfiles, MAX_SCORES, MAX_HISTORY } from '../app/profiles.js';
import { newGame, place, canPlaceSlot } from '../engine/index.js';

function memoryStorage(init = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

test('players are added once per name, renamed and removed with their data', () => {
  const s = memoryStorage();
  const pr = createProfiles(s);
  const mia = pr.addPlayer('  Mia ');
  assert.equal(mia.name, 'Mia');
  assert.equal(pr.addPlayer('mia').id, mia.id);
  assert.equal(pr.addPlayer('   '), null);
  const tom = pr.addPlayer('Tom');
  assert.equal(pr.renamePlayer(tom.id, 'MIA'), false, 'no duplicate names');
  assert.equal(pr.renamePlayer(tom.id, 'Tommy'), true);
  pr.setCurrent(tom.id);
  pr.saveGame(tom.id, newGame({ seed: 1 }), Array(64).fill(null));
  pr.addScore(tom.id, { score: 50, level: 1 });
  pr.removePlayer(tom.id);
  assert.deepEqual(pr.players().map((p) => p.name), ['Mia']);
  assert.equal(pr.current(), null);
  assert.ok(![...s.data.keys()].some((k) => k.includes(tom.id)));
});

test('each player has their own saved game', () => {
  const pr = createProfiles(memoryStorage());
  const a = pr.addPlayer('A'), b = pr.addPlayer('B');
  const g = newGame({ seed: 7 });
  g.score = 123;
  pr.saveGame(a.id, g, Array(64).fill('x'));
  assert.equal(pr.loadGame(a.id).state.score, 123);
  assert.equal(pr.loadGame(b.id), null);
  g.gameOver = true;
  pr.saveGame(a.id, g, Array(64).fill(null));
  assert.equal(pr.loadGame(a.id), null, 'finished games are not resumed');
});

test('top 10 per player keeps the best scores in order', () => {
  const pr = createProfiles(memoryStorage());
  const a = pr.addPlayer('A'), b = pr.addPlayer('B');
  for (let i = 1; i <= 12; i++) pr.addScore(a.id, { score: i * 10, level: 1, date: i });
  const list = pr.scores(a.id);
  assert.equal(list.length, MAX_SCORES);
  assert.deepEqual(list.map((x) => x.score), [120, 110, 100, 90, 80, 70, 60, 50, 40, 30]);
  assert.equal(pr.addScore(a.id, { score: 5, level: 1 }).rank, -1);
  assert.equal(pr.addScore(a.id, { score: 115, level: 3 }).rank, 1);
  assert.equal(pr.addScore(a.id, { score: 0, level: 1 }).rank, -1);
  assert.equal(pr.best(a.id), 120);
  assert.deepEqual(pr.scores(b.id), []);
});

test('settings default to sound and vibration off', () => {
  const pr = createProfiles(memoryStorage());
  assert.deepEqual(pr.settings(), { sound: false, haptics: false, theme: 'auto' });
  pr.saveSettings({ sound: true });
  assert.equal(pr.settings().sound, true);
});

test('the test page game and shared high scores move into players once', () => {
  const g = newGame({ seed: 3 });
  g.moves = 4; g.score = 40;
  const s = memoryStorage({
    'bb-game': JSON.stringify(g),
    'bb-game-colors': JSON.stringify(Array(64).fill(null)),
    'bb-name': JSON.stringify('Jan'),
    'bb-scores': JSON.stringify([
      { name: 'Mia', score: 300, level: 4, date: 2 },
      { name: 'Jan', score: 200, level: 3, date: 1 },
      { name: 'mia ', score: 100, level: 2, date: 3 },
    ]),
  });
  const pr = createProfiles(s);
  assert.equal(pr.migrateLegacy(), true);
  assert.deepEqual(pr.players().map((p) => p.name).sort(), ['Jan', 'Mia']);
  const jan = pr.current();
  assert.equal(jan.name, 'Jan');
  assert.equal(pr.loadGame(jan.id).state.score, 40);
  const mia = pr.players().find((p) => p.name === 'Mia');
  assert.deepEqual(pr.scores(mia.id).map((x) => x.score), [300, 100]);
  assert.equal(pr.migrateLegacy(), false, 'runs once');
});

test('a fresh phone migrates nothing', () => {
  const pr = createProfiles(memoryStorage());
  assert.equal(pr.migrateLegacy(), false);
  assert.deepEqual(pr.players(), []);
});

// Plays one piece wherever it fits first.
function playOne(g) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (canPlaceSlot(g, 0, r, c)) { place(g, 0, r, c); return g; }
  return g;
}

test('every played game gets a history entry: playing, then over or abandoned', () => {
  const pr = createProfiles(memoryStorage());
  const p = pr.addPlayer('Mia');
  const untouched = newGame({ seed: 1 });
  pr.saveGame(p.id, untouched, Array(64).fill(null));
  assert.deepEqual(pr.history(p.id), [], 'a game nobody moved in is not listed');

  const g = playOne(newGame({ seed: 2, level: 1 }));
  pr.saveGame(p.id, g, Array(64).fill(null));
  const [e] = pr.history(p.id);
  assert.equal(e.id, g.gid);
  assert.equal(e.status, 'playing');
  assert.equal(e.end, null);
  assert.equal(e.score, g.score);
  assert.ok(e.start > 0);

  pr.abandonGame(p.id, g.gid, 999);
  assert.equal(pr.history(p.id)[0].status, 'abandoned');
  assert.equal(pr.history(p.id)[0].end, 999);
  // Saving the abandoned game again does not revive it.
  pr.saveGame(p.id, g, Array(64).fill(null));
  assert.equal(pr.history(p.id)[0].status, 'abandoned');

  const h = playOne(newGame({ seed: 3 }));
  pr.saveGame(p.id, h, Array(64).fill(null));
  h.gameOver = true;
  pr.saveGame(p.id, h, Array(64).fill(null));
  const ended = pr.history(p.id).find((x) => x.id === h.gid);
  assert.equal(ended.status, 'over');
  assert.ok(ended.end >= ended.start);
  assert.equal(pr.history(p.id).length, 2);
});

test('a deleted game leaves the list but stays as a marker for syncing', () => {
  const pr = createProfiles(memoryStorage());
  const p = pr.addPlayer('Tom');
  const g = playOne(newGame({ seed: 4 }));
  pr.saveGame(p.id, g, Array(64).fill(null));
  pr.deleteGame(p.id, g.gid);
  assert.deepEqual(pr.history(p.id), []);
  assert.equal(pr.allHistory(p.id)[0].deleted, true);
});

test('the history keeps the newest 500 games per player', () => {
  const pr = createProfiles(memoryStorage());
  const p = pr.addPlayer('Ana');
  pr.setHistory(p.id, Array.from({ length: 520 }, (_, i) => ({ id: 'g' + i, start: i, end: i, score: 1, startLevel: 1, level: 1, status: 'over', at: i })));
  assert.equal(pr.history(p.id).length, MAX_HISTORY);
  assert.equal(pr.history(p.id)[0].id, 'g519');
});

test('start levels unlock up to the highest level reached', () => {
  const pr = createProfiles(memoryStorage());
  const p = pr.addPlayer('Ben');
  assert.equal(pr.reached(p.id), 1);
  pr.setStartLevel(p.id, 5);
  assert.equal(pr.startLevel(p.id), 1, 'cannot start above what was reached');
  pr.addScore(p.id, { score: 40, level: 3 });
  assert.equal(pr.reached(p.id), 3);
  assert.equal(pr.startLevel(p.id), 3);
  pr.setHistory(p.id, [{ id: 'x', start: 1, end: 2, score: 5, startLevel: 3, level: 6, status: 'abandoned', at: 2 }]);
  assert.equal(pr.reached(p.id), 6);
  assert.equal(pr.startLevel(p.id), 5);
});

test('top 10 can be narrowed to games started at one level', () => {
  const pr = createProfiles(memoryStorage());
  const p = pr.addPlayer('Lea');
  pr.addScore(p.id, { score: 100, level: 2, date: 1 });                          // from before start levels: level 1
  pr.addScore(p.id, { score: 300, level: 5, date: 2, startLevel: 4, gid: 'a' });
  pr.setHistory(p.id, [
    { id: 'a', start: 1, end: 2, score: 300, startLevel: 4, level: 5, status: 'over', at: 2 },
    { id: 'b', start: 3, end: 4, score: 50, startLevel: 4, level: 4, status: 'over', at: 4 },
    { id: 'c', start: 5, end: null, score: 900, startLevel: 4, level: 6, status: 'playing', at: 5 },
  ]);
  assert.deepEqual(pr.top(p.id).map((s) => s.score), [300, 100, 50]);
  assert.deepEqual(pr.top(p.id, 4).map((s) => s.score), [300, 50]);
  assert.deepEqual(pr.top(p.id, 1).map((s) => s.score), [100]);
  pr.deleteGame(p.id, 'a');
  assert.deepEqual(pr.top(p.id, 4).map((s) => s.score), [50]);
});
