import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBoard, boardFromStrings, boardToString, canPlace, placeAndClear, countFilled,
  PIECES, getPiece, createRng, solvableInOrder, analyzeOrders, anyOrderSolvable,
  dealRound, difficultyForLevel, levelForProgress, newGame, place, trayPieces, placements,
  scorePlacement,
} from '../engine/index.js';

// Row 0 has a 5-cell gap, every other row a single hole, so a 2-line only fits
// in row 0 and a 5-line only fits there before the 2-line goes in.
const STRAND_BOARD = [
  '###.....',
  '.#######',
  '#.######',
  '##.#####',
  '###.####',
  '####.###',
  '#####.##',
  '######.#',
];

test('piece ids are unique and shapes are within 5x5', () => {
  assert.equal(new Set(PIECES.map((p) => p.id)).size, PIECES.length);
  for (const p of PIECES) {
    assert.ok(p.width <= 5 && p.height <= 5);
    assert.equal(p.size, p.cells.length);
  }
});

test('placement respects bounds and filled cells', () => {
  const b = boardFromStrings(['#.......']);
  const sq = getPiece('square2');
  assert.equal(canPlace(b, sq, 0, 0), false);
  assert.equal(canPlace(b, sq, 0, 1), true);
  assert.equal(canPlace(b, sq, 7, 0), false);
  assert.equal(canPlace(b, sq, 0, 7), false);
});

test('full rows and columns clear at the same time', () => {
  const b = boardFromStrings([
    '#######.',
    '.......#',
    '.......#',
    '.......#',
    '.......#',
    '.......#',
    '.......#',
    '.......#',
  ]);
  const res = placeAndClear(b, getPiece('dot'), 0, 7);
  assert.deepEqual(res.clearedRows, [0]);
  assert.deepEqual(res.clearedCols, [7]);
  assert.equal(countFilled(b), 0);
});

test('order matters: analyzeOrders finds exactly the working orders', () => {
  // Row 0 has a 5-cell gap; every other row has a single hole.
  const b = boardFromStrings(STRAND_BOARD);
  // line5h first clears row 0 and nothing else; line2h then fits in the cleared row.
  // line2h first fits in row 0 too, then line5h no longer fits.
  const r = analyzeOrders(b, [getPiece('line5h'), getPiece('line2h')]);
  assert.deepEqual(r.orders.map((o) => o.solvable), [true, false]);
});

test('rng is reproducible and resumable', () => {
  const a = createRng(42);
  const seq = [a.next(), a.next()];
  const b = createRng(42);
  assert.deepEqual([b.next(), b.next()], seq);
  const c = createRng(a.state);
  assert.equal(c.next(), a.next());
});

test('dealt rounds are always solvable and every piece fits', () => {
  const rng = createRng(7);
  for (let level = 1; level <= 10; level++) {
    for (let i = 0; i < 30; i++) {
      // Random crowded board.
      const b = createBoard();
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (rng.next() < 0.55) b[r] |= 1 << c;
      for (let r = 0; r < 8; r++) if (b[r] === 255) b[r] = 0;
      const round = dealRound(b, rng, difficultyForLevel(level));
      assert.equal(round.pieces.length, 3);
      assert.ok(anyOrderSolvable(b, round.pieces), `unsolvable deal at level ${level}:\n${boardToString(b)}`);
      for (const p of round.pieces) assert.ok(placements(b, p).length > 0);
    }
  }
});

test('nearly full board falls back to something placeable', () => {
  const b = boardFromStrings([
    '#######.', '######.#', '#####.##', '####.###',
    '###.####', '##.#####', '#.######', '.#######',
  ]);
  const round = dealRound(b, createRng(1), difficultyForLevel(10));
  assert.ok(anyOrderSolvable(b, round.pieces));
});

test('difficulty ramps from forgiving to strict', () => {
  const easy = difficultyForLevel(1);
  const hard = difficultyForLevel(10);
  assert.ok(easy.orders.min > hard.orders.min);
  assert.ok(easy.tierWeights.hard < hard.tierWeights.hard);
  assert.equal(levelForProgress({ linesCleared: 0 }), 1);
  assert.equal(levelForProgress({ linesCleared: 1000 }), 10);
});

test('each level is at least as hard as the one before', () => {
  for (let level = 2; level <= 10; level++) {
    const prev = difficultyForLevel(level - 1);
    const cur = difficultyForLevel(level);
    assert.ok(cur.tierWeights.hard >= prev.tierWeights.hard, `hard share drops at level ${level}`);
    assert.ok(cur.tierWeights.easy <= prev.tierWeights.easy, `easy share rises at level ${level}`);
    assert.ok(cur.orders.min <= prev.orders.min && cur.orders.max <= prev.orders.max, `order band loosens at level ${level}`);
  }
});

test('scoring rewards multi-line clears and combos', () => {
  assert.equal(scorePlacement({ cells: 3, lines: 0, combo: 0 }), 3);
  assert.equal(scorePlacement({ cells: 3, lines: 1, combo: 0 }), 13);
  assert.equal(scorePlacement({ cells: 3, lines: 2, combo: 0 }), 33);
  assert.equal(scorePlacement({ cells: 3, lines: 1, combo: 2 }), 23);
  assert.equal(scorePlacement({ cells: 1, lines: 2, combo: 0, boardCleared: true }), 331);
});

test('game flow: place, redeal after three, state survives JSON', () => {
  let state = newGame({ seed: 99 });
  assert.equal(state.tray.length, 3);
  assert.equal(place(state, 0, -1, 0).ok, false);
  for (let i = 0; i < 3; i++) {
    state = JSON.parse(JSON.stringify(state));
    const slot = state.tray.findIndex((t) => !t.used);
    const piece = trayPieces(state)[slot].piece;
    const [r, c] = placements(state.board, piece)[0];
    const res = place(state, slot, r, c);
    assert.ok(res.ok);
    assert.equal(res.dealt, i === 2);
  }
  assert.ok(state.tray.every((t) => !t.used));
  assert.equal(state.rounds, 2);
  assert.ok(state.score > 0);
});

test('game ends when a placement strands the rest of the round', () => {
  const state = newGame({ seed: 1 });
  state.board = boardFromStrings(STRAND_BOARD);
  state.tray = [{ id: 'line5h', used: false }, { id: 'line2h', used: false }, { id: 'dot', used: true }];
  const res = place(state, 1, 0, 3); // line2 into the gap first: line5 can no longer fit
  assert.ok(res.ok);
  assert.equal(res.gameOver, true);
  assert.equal(place(state, 0, 0, 3).ok, false);
});

test('a game can start at a higher level and climbs from there', () => {
  const g = newGame({ seed: 3, level: 4 });
  assert.equal(g.level, 4);
  assert.equal(g.startLevel, 4);
  assert.equal(levelForProgress({ linesCleared: 7, startLevel: 4 }), 4);
  assert.equal(levelForProgress({ linesCleared: 8, startLevel: 4 }), 5);
  assert.equal(levelForProgress({ linesCleared: 1000, startLevel: 4 }), 10);
  assert.equal(newGame({ level: 99 }).level, 10);
  assert.equal(newGame({ level: 0 }).level, 1);
  assert.equal(newGame().startLevel, 1);
});

// ---------- slide and gravity modes ----------

const MODE_SIZE = 8;
// Fill one cell so the given row or column becomes full, the way a placed dot would.
function placeDot(lines, r, c, mode) {
  const b = boardFromStrings(lines);
  const res = placeAndClear(b, getPiece('dot'), r, c, mode, true);
  return { board: boardToString(b).split('\n'), res };
}

test('slide: a row in the bottom half lets everything above slide down', () => {
  const { board, res } = placeDot([
    '........',
    '..#.....',
    '..##....',
    '.###..#.',
    '....#.##',
    '##...###',
    '#######.',
    '..#....#',
  ], 6, 7, 'slide');
  assert.deepEqual(res.clearedRows, [6]);
  assert.deepEqual(board, [
    '........',
    '........',
    '..#.....',
    '..##....',
    '.###..#.',
    '....#.##',
    '##...###',
    '..#....#',
  ]);
  // The map follows each block: (3,1) moved to (4,1), the bottom row stayed.
  assert.equal(res.steps[0].map[3 * 8 + 1], 4 * 8 + 1);
  assert.equal(res.steps[0].map[7 * 8 + 2], 7 * 8 + 2);
  assert.equal(res.steps[0].map[6 * 8 + 0], -1);
});

test('slide: a row in the top half lets everything below slide up', () => {
  const { board } = placeDot([
    '#.......',
    '.#######',
    '...#....',
    '........',
    '........',
    '........',
    '......#.',
    '#......#',
  ], 1, 0, 'slide');
  assert.deepEqual(board, [
    '#.......',
    '...#....',
    '........',
    '........',
    '........',
    '......#.',
    '#......#',
    '........',
  ]);
});

test('slide: rows in both halves at once push the edge rows inward', () => {
  const { board } = placeDot([
    '...#....',
    '#######.',
    '..##....',
    '........',
    '...#....',
    '.##.....',
    '########',
    '#......#',
  ], 1, 7, 'slide');
  assert.deepEqual(board, [
    '........',
    '...#....',
    '..##....',
    '........',
    '...#....',
    '.##.....',
    '#......#',
    '........',
  ]);
});

test('slide: a column in the right half lets everything left of it slide right', () => {
  const { board, res } = placeDot([
    '##...#..',
    '#....#..',
    '##...##.',
    '#....#..',
    '....##..',
    '##...#..',
    '#....#.#',
    '###.....',
  ], 7, 5, 'slide');
  assert.deepEqual(res.clearedCols, [5]);
  assert.deepEqual(board, [
    '.##.....',
    '.#......',
    '.##...#.',
    '.#......',
    '.....#..',
    '.##.....',
    '.#.....#',
    '.###....',
  ]);
});

test('slide: a column in the left half lets everything right of it slide left', () => {
  const { board } = placeDot([
    '.#.....#',
    '.#......',
    '.#......',
    '.#......',
    '.#....#.',
    '.#......',
    '.#......',
    '#.......',
  ], 7, 1, 'slide');
  assert.deepEqual(board, [
    '......#.',
    '........',
    '........',
    '........',
    '.....#..',
    '........',
    '........',
    '#.......',
  ]);
});

test('slide: a cross of row and column moves both ways and never fills a new line', () => {
  const rng = createRng(77);
  for (let n = 0; n < 2000; n++) {
    const lines = Array.from({ length: MODE_SIZE }, () => Array.from({ length: MODE_SIZE }, () => (rng.next() < 0.8 ? '#' : '.')).join(''));
    const classic = boardFromStrings(lines), slid = boardFromStrings(lines);
    const a = placeAndClear(classic, getPiece('dot'), 0, 0, 'classic');
    const b = placeAndClear(slid, getPiece('dot'), 0, 0, 'slide');
    if (!canPlace(boardFromStrings(lines), getPiece('dot'), 0, 0)) continue;
    assert.deepEqual(b.clearedRows, a.clearedRows);
    assert.equal(countFilled(slid), countFilled(classic));
    assert.equal(b.steps.length <= 1, true);
    for (let i = 0; i < MODE_SIZE; i++) assert.notEqual(slid[i], 255);
    for (let j = 0; j < MODE_SIZE; j++) assert.equal(slid.every((v) => (v >> j) & 1), false);
  }
});

test('gravity: loose blocks fall until they land', () => {
  const { board, res } = placeDot([
    '..#.....',
    '........',
    '.#......',
    '........',
    '#.......',
    '........',
    '#######.',
    '#.....#.',
  ], 6, 7, 'gravity');
  assert.equal(res.steps.length, 1);
  assert.deepEqual(board, [
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '#.......',
    '###...#.',
  ]);
});

test('gravity: touching blocks fall together and keep the hole under an overhang', () => {
  const { board } = placeDot([
    '........',
    '........',
    '........',
    '........',
    '##......',
    '#.......',
    '#######.',
    '........',
  ], 6, 7, 'gravity');
  assert.deepEqual(board.slice(5), [
    '........',
    '##......',
    '#.......',
  ]);
});

test('gravity: a fall that fills a line clears it too (chain), and scores more', () => {
  // Clearing row 7 drops everything into the bottom row, which is then full again.
  const { board, res } = placeDot([
    '........',
    '........',
    '........',
    '........',
    '........',
    '...##...',
    '###..###',
    '#######.',
  ], 7, 7, 'gravity');
  assert.equal(res.steps.length, 2);
  assert.deepEqual(res.steps[1].clearedRows, [7]);
  assert.deepEqual(board, Array(8).fill('........'));
  const chain = res.steps.map((s) => s.clearedRows.length + s.clearedCols.length);
  // The second link counts as one more combo step: 10 + 10 x 1.5.
  assert.deepEqual(chain, [1, 1]);
  assert.equal(scorePlacement({ cells: 1, lines: 2, combo: 0, boardCleared: false, chain }), 1 + 10 + 15);
});

test('gravity: rows in both halves split the board, top falls up and bottom down', () => {
  const { board } = placeDot([
    '........',
    '#######.',
    '........',
    '..#.....',
    '.....#..',
    '........',
    '########',
    '........',
  ], 1, 7, 'gravity');
  assert.deepEqual(board, [
    '..#.....',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '.....#..',
  ]);
});

test('every mode deals solvable rounds and plays a game through', () => {
  for (const mode of ['slide', 'gravity']) {
    const state = newGame({ seed: 4242, mode });
    assert.equal(state.mode, mode);
    const rng = createRng(1);
    for (let n = 0; n < 60 && !state.gameOver; n++) {
      const tray = trayPieces(state);
      const pieces = tray.filter((t) => !t.used).map((t) => t.piece);
      if (tray.every((t) => !t.used)) assert.ok(anyOrderSolvable(state.board, pieces, mode));
      const slot = tray.findIndex((t) => !t.used);
      const spots = placements(state.board, tray[slot].piece);
      const [r, c] = spots[rng.int(spots.length)];
      const res = place(state, slot, r, c);
      assert.ok(res.ok);
    }
    const copy = JSON.parse(JSON.stringify(state));
    assert.equal(copy.mode, mode);
  }
  assert.equal(newGame({ seed: 1, mode: 'nonsense' }).mode, 'classic');
});
