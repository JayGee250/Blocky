import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfiles, MAX_SCORES } from '../app/profiles.js';
import { newGame } from '../engine/index.js';

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
