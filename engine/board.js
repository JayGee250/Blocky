// The board is an array of SIZE row bitmasks: bit c of rows[r] is set when
// cell (r, c) is filled. This keeps placement checks and copies cheap, which
// matters because the generator simulates many placements per round.
export const SIZE = 8;
export const FULL_ROW = (1 << SIZE) - 1;

export function createBoard() {
  return new Array(SIZE).fill(0);
}

export function cloneBoard(rows) {
  return rows.slice();
}

export function isFilled(rows, r, c) {
  return (rows[r] >> c) & 1;
}

export function countFilled(rows) {
  let n = 0;
  for (let r = 0; r < SIZE; r++) {
    let v = rows[r];
    while (v) { v &= v - 1; n++; }
  }
  return n;
}

export function isEmpty(rows) {
  return rows.every((v) => v === 0);
}

// Can `piece` have its top-left bounding-box corner at (r, c)?
export function canPlace(rows, piece, r, c) {
  if (r < 0 || c < 0 || r + piece.height > SIZE || c + piece.width > SIZE) return false;
  const masks = piece.rowMasks;
  for (let i = 0; i < masks.length; i++) {
    if (rows[r + i] & (masks[i] << c)) return false;
  }
  return true;
}

// Every (r, c) where the piece fits.
export function placements(rows, piece) {
  const out = [];
  for (let r = 0; r <= SIZE - piece.height; r++) {
    for (let c = 0; c <= SIZE - piece.width; c++) {
      if (canPlace(rows, piece, r, c)) out.push([r, c]);
    }
  }
  return out;
}

export function fitsAnywhere(rows, piece) {
  for (let r = 0; r <= SIZE - piece.height; r++) {
    for (let c = 0; c <= SIZE - piece.width; c++) {
      if (canPlace(rows, piece, r, c)) return true;
    }
  }
  return false;
}

// Game modes: what happens to the rest of the board after lines clear.
//   classic  lines vanish, nothing else moves
//   slide    every cleared line pulls the board on the centre side of it one
//            step toward its nearest edge, as a rigid block (like Tetris). A row
//            in the bottom half lets everything above it slide down, a row in
//            the top half lets everything below slide up; columns the same way
//            sideways. The freed line appears at the opposite edge. The result
//            does not depend on the order lines are handled in, and sliding
//            never fills a new line, so there are no chain reactions.
//   gravity  blocks fall in the same directions until they land on another
//            block or the edge. Touching blocks hold together and fall as one
//            body, so overhangs keep the holes under them. Rows first, then columns.
//            Lines filled by the fall clear too, and so on (a chain).
export const MODES = ['classic', 'slide', 'gravity'];
export const HALF = SIZE / 2;

// Places the piece in-place (caller must check canPlace first), then clears
// every full row and column simultaneously and lets the board move as `mode`
// says. Returns which lines cleared in the first step, and every step
// (several only in gravity mode): { clearedRows, clearedCols, steps }.
// With `track`, each step also carries `map`: map[old cell] = new cell (r * 8 + c)
// for every block that survived the step, -1 for cleared cells and empty ones.
export function placeAndClear(rows, piece, r, c, mode = 'classic', track = false) {
  const masks = piece.rowMasks;
  for (let i = 0; i < masks.length; i++) rows[r + i] |= masks[i] << c;
  const steps = resolveLines(rows, mode, track);
  const first = steps[0] || { clearedRows: [], clearedCols: [] };
  return { clearedRows: first.clearedRows, clearedCols: first.clearedCols, steps };
}

function fullLines(rows) {
  const clearedRows = [];
  let colsFull = FULL_ROW;
  for (let i = 0; i < SIZE; i++) {
    if (rows[i] === FULL_ROW) clearedRows.push(i);
    colsFull &= rows[i];
  }
  const clearedCols = [];
  for (let j = 0; j < SIZE; j++) if ((colsFull >> j) & 1) clearedCols.push(j);
  return { clearedRows, clearedCols, colsFull };
}

export function resolveLines(rows, mode = 'classic', track = false) {
  const steps = [];
  for (;;) {
    const { clearedRows, clearedCols, colsFull } = fullLines(rows);
    if (!clearedRows.length && !clearedCols.length) break;
    const step = { clearedRows, clearedCols };
    if (mode === 'classic' && !track) {
      for (const i of clearedRows) rows[i] = 0;
      if (colsFull) for (let i = 0; i < SIZE; i++) rows[i] &= ~colsFull & FULL_ROW;
    } else {
      // Work on a grid of cell ids so blocks can be followed (for the map).
      let grid = toGrid(rows);
      for (const i of clearedRows) for (let j = 0; j < SIZE; j++) grid[i * SIZE + j] = -1;
      for (const j of clearedCols) for (let i = 0; i < SIZE; i++) grid[i * SIZE + j] = -1;
      if (mode === 'slide') grid = slide(grid, clearedRows, clearedCols);
      else if (mode === 'gravity') { fall(grid, clearedRows, true); fall(grid, clearedCols, false); }
      fromGrid(grid, rows);
      if (track) {
        const map = new Array(SIZE * SIZE).fill(-1);
        grid.forEach((id, at) => { if (id >= 0) map[id] = at; });
        step.map = map;
      }
    }
    steps.push(step);
    if (mode !== 'gravity') break;
  }
  return steps;
}

function toGrid(rows) {
  const grid = new Array(SIZE * SIZE).fill(-1);
  for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE; j++) if ((rows[i] >> j) & 1) grid[i * SIZE + j] = i * SIZE + j;
  return grid;
}

function fromGrid(grid, rows) {
  for (let i = 0; i < SIZE; i++) {
    let v = 0;
    for (let j = 0; j < SIZE; j++) if (grid[i * SIZE + j] >= 0) v |= 1 << j;
    rows[i] = v;
  }
}

// n cleared rows in the bottom half put n empty rows on top, m in the top half
// put m empty rows at the bottom, and the remaining rows keep their order in
// between. Columns the same way: cleared in the right half -> empty on the left.
function slide(grid, clearedRows, clearedCols) {
  const keepR = [], keepC = [];
  for (let i = 0; i < SIZE; i++) if (!clearedRows.includes(i)) keepR.push(i);
  for (let j = 0; j < SIZE; j++) if (!clearedCols.includes(j)) keepC.push(j);
  const top = clearedRows.filter((i) => i >= HALF).length;
  const left = clearedCols.filter((j) => j >= HALF).length;
  const out = new Array(SIZE * SIZE).fill(-1);
  keepR.forEach((i, a) => keepC.forEach((j, b) => { out[(top + a) * SIZE + left + b] = grid[i * SIZE + j]; }));
  return out;
}

// Blocks fall toward an edge. Lines cleared only in the bottom half: the whole
// board falls down (only in the top half: up). Both halves: the top half falls
// up and the bottom half down. `vertical` false does the same for columns.
// Blocks that touch (side by side or one above the other) hold together and
// fall as one body until any of its blocks lands, so holes under an overhang
// stay open. Bodies nearest the edge land first; repeat until nothing moves.
function fall(grid, cleared, vertical) {
  if (!cleared.length) return;
  const far = cleared.some((k) => k >= HALF), near = cleared.some((k) => k < HALF);
  const segments = far && near ? [[0, HALF, -1], [HALF, SIZE, 1]] : [[0, SIZE, far ? 1 : -1]];
  // u runs along the fall, v across it.
  const at = (u, v) => (vertical ? u * SIZE + v : v * SIZE + u);
  for (const [from, to, dir] of segments) {
    for (let moved = true; moved;) {
      moved = false;
      for (const body of bodies(grid, from, to, at)) {
        const lead = (n) => body.every(([u, v]) => {
          const u2 = u + n * dir;
          if (u2 < from || u2 >= to) return false;
          const id = grid[at(u2, v)];
          return id < 0 || body.own.has(at(u2, v));
        });
        let d = 0;
        while (lead(d + 1)) d++;
        if (!d) continue;
        const ids = body.map(([u, v]) => grid[at(u, v)]);
        for (const [u, v] of body) grid[at(u, v)] = -1;
        body.forEach(([u, v], n) => { grid[at(u + d * dir, v)] = ids[n]; });
        moved = true;
        break; // bodies may have merged: look again
      }
    }
  }
  function bodies(g, lo, hi, idx) {
    const seen = new Set(), out = [];
    for (let u = lo; u < hi; u++) for (let v = 0; v < SIZE; v++) {
      if (g[idx(u, v)] < 0 || seen.has(idx(u, v))) continue;
      const body = [], stack = [[u, v]];
      seen.add(idx(u, v));
      while (stack.length) {
        const [cu, cv] = stack.pop();
        body.push([cu, cv]);
        for (const [nu, nv] of [[cu + 1, cv], [cu - 1, cv], [cu, cv + 1], [cu, cv - 1]]) {
          if (nu < lo || nu >= hi || nv < 0 || nv >= SIZE || g[idx(nu, nv)] < 0 || seen.has(idx(nu, nv))) continue;
          seen.add(idx(nu, nv));
          stack.push([nu, nv]);
        }
      }
      body.own = new Set(body.map(([bu, bv]) => idx(bu, bv)));
      out.push(body);
    }
    // Nearest the edge first, so what lies below has landed already.
    const reach = (b) => Math.max(...b.map(([bu]) => bu * dirOf(lo, hi)));
    return out.sort((x, y) => reach(y) - reach(x));
  }
  function dirOf(lo, hi) { return segments.find(([f, t]) => f === lo && t === hi)[2]; }
}

// Debug helper: board as text, '#' filled, '.' empty.
export function boardToString(rows) {
  return rows
    .map((v) => Array.from({ length: SIZE }, (_, c) => ((v >> c) & 1 ? '#' : '.')).join(''))
    .join('\n');
}

// Inverse of boardToString, handy for tests.
export function boardFromStrings(lines) {
  const rows = createBoard();
  lines.forEach((line, r) => {
    for (let c = 0; c < SIZE; c++) if (line[c] === '#') rows[r] |= 1 << c;
  });
  return rows;
}
