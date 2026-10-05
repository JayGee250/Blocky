// Piece library. Pieces cannot be rotated, so every orientation is its own
// shape. `tier` drives difficulty weighting: easy pieces are small and
// forgiving, hard pieces are big or awkward.

function shape(id, family, tier, art) {
  const lines = art.trim().split('|');
  const cells = [];
  lines.forEach((line, r) => {
    [...line].forEach((ch, c) => { if (ch === '#') cells.push([r, c]); });
  });
  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));
  const rowMasks = lines.map((line) => [...line].reduce((m, ch, c) => (ch === '#' ? m | (1 << c) : m), 0));
  return Object.freeze({ id, family, tier, cells, width, height, rowMasks, size: cells.length });
}

export const PIECES = Object.freeze([
  // easy
  shape('dot', 'dot', 'easy', '#'),
  shape('line2h', 'line2', 'easy', '##'),
  shape('line2v', 'line2', 'easy', '#|#'),
  shape('line3h', 'line3', 'easy', '###'),
  shape('line3v', 'line3', 'easy', '#|#|#'),
  shape('square2', 'square2', 'easy', '##|##'),
  shape('corner3a', 'corner3', 'easy', '##|#.'),
  shape('corner3b', 'corner3', 'easy', '##|.#'),
  shape('corner3c', 'corner3', 'easy', '#.|##'),
  shape('corner3d', 'corner3', 'easy', '.#|##'),

  // medium
  shape('line4h', 'line4', 'medium', '####'),
  shape('line4v', 'line4', 'medium', '#|#|#|#'),
  shape('rect2x3', 'rect', 'medium', '###|###'),
  shape('rect3x2', 'rect', 'medium', '##|##|##'),
  shape('l4a', 'l4', 'medium', '#.|#.|##'),
  shape('l4b', 'l4', 'medium', '.#|.#|##'),
  shape('l4c', 'l4', 'medium', '##|#.|#.'),
  shape('l4d', 'l4', 'medium', '##|.#|.#'),
  shape('l4e', 'l4', 'medium', '###|#..'),
  shape('l4f', 'l4', 'medium', '###|..#'),
  shape('l4g', 'l4', 'medium', '#..|###'),
  shape('l4h', 'l4', 'medium', '..#|###'),
  shape('t4a', 't4', 'medium', '###|.#.'),
  shape('t4b', 't4', 'medium', '.#.|###'),
  shape('t4c', 't4', 'medium', '#.|##|#.'),
  shape('t4d', 't4', 'medium', '.#|##|.#'),

  // hard
  shape('s4h', 's4', 'hard', '.##|##.'),
  shape('z4h', 's4', 'hard', '##.|.##'),
  shape('s4v', 's4', 'hard', '#.|##|.#'),
  shape('z4v', 's4', 'hard', '.#|##|#.'),
  shape('line5h', 'line5', 'hard', '#####'),
  shape('line5v', 'line5', 'hard', '#|#|#|#|#'),
  shape('square3', 'square3', 'hard', '###|###|###'),
  shape('bigl5a', 'bigl5', 'hard', '###|#..|#..'),
  shape('bigl5b', 'bigl5', 'hard', '###|..#|..#'),
  shape('bigl5c', 'bigl5', 'hard', '#..|#..|###'),
  shape('bigl5d', 'bigl5', 'hard', '..#|..#|###'),
]);

export const PIECES_BY_ID = Object.freeze(Object.fromEntries(PIECES.map((p) => [p.id, p])));

export function getPiece(id) {
  const p = PIECES_BY_ID[id];
  if (!p) throw new Error(`Unknown piece: ${id}`);
  return p;
}
