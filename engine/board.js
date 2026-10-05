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

// Places the piece in-place (caller must check canPlace first), then clears
// every full row and column simultaneously. Returns which lines cleared.
export function placeAndClear(rows, piece, r, c) {
  const masks = piece.rowMasks;
  for (let i = 0; i < masks.length; i++) rows[r + i] |= masks[i] << c;

  const clearedRows = [];
  let colsFull = FULL_ROW;
  for (let i = 0; i < SIZE; i++) {
    if (rows[i] === FULL_ROW) clearedRows.push(i);
    colsFull &= rows[i];
  }
  const clearedCols = [];
  for (let j = 0; j < SIZE; j++) if ((colsFull >> j) & 1) clearedCols.push(j);

  if (clearedRows.length || clearedCols.length) {
    for (const i of clearedRows) rows[i] = 0;
    if (colsFull) for (let i = 0; i < SIZE; i++) rows[i] &= ~colsFull & FULL_ROW;
  }
  return { clearedRows, clearedCols };
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
