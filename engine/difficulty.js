// Difficulty knobs the generator reads. After changing the table below, check
// the curve with `node tools/curve.js 60` (results are in the README).
//
//   tierWeights   chance of drawing an easy / medium / hard piece
//   orders        how many of the 6 orderings of a round may solve it.
//                 Many = forgiving; 1-2 = the player must find the right order.
//   tightness     0..1, how hard the generator looks for rounds whose pieces
//                 have few spots to go (0 = no preference)
//   candidates    rounds sampled per deal before settling for the closest

export const MAX_LEVEL = 10;

// One row per level. Levels 1-3 are meant for everyone (young kids included):
// mostly small pieces and most orders work. From level 4 the order starts to
// matter, and levels 8-10 usually leave only one or two working orders.
// Every round stays solvable in at least one order at every level.
const LEVELS = [
  //  easy medium hard   orders   tightness
  [75, 22, 3, 4, 6, 0],     // 1
  [70, 26, 4, 4, 6, 0],     // 2
  [62, 31, 7, 3, 6, 0],     // 3
  [55, 34, 11, 3, 6, 0.05], // 4
  [48, 37, 15, 3, 6, 0.1],  // 5
  [42, 38, 20, 3, 6, 0.2],  // 6
  [35, 40, 25, 3, 5, 0.15], // 7
  [28, 40, 32, 2, 4, 0.2],  // 8
  [22, 40, 38, 1, 3, 0.4],  // 9
  [15, 40, 45, 1, 2, 0.6],  // 10
];

export function difficultyForLevel(level) {
  const [easy, medium, hard, min, max, tightness] = LEVELS[Math.min(Math.max(level, 1), MAX_LEVEL) - 1];
  return { level, tierWeights: { easy, medium, hard }, orders: { min, max }, tightness, candidates: 40 };
}

// Level rises with lines cleared: one level per LINES_PER_LEVEL lines.
export const LINES_PER_LEVEL = 8;

export function levelForProgress({ linesCleared }) {
  return Math.min(MAX_LEVEL, 1 + Math.floor(linesCleared / LINES_PER_LEVEL));
}
