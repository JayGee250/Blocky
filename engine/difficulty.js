// Difficulty knobs the generator reads. After changing the table below, check
// the curve with `node tools/curve.js 60` (results are in the README).
//
//   tierWeights   chance of drawing an easy / medium / hard / expert piece
//   orders        how many of the 6 orderings of a round may solve it.
//                 Many = forgiving; 1-2 = the player must find the right order.
//   tightness     0..1, how hard the generator looks for rounds whose pieces
//                 have few spots to go (0 = no preference)
//   candidates    rounds sampled per deal before settling for the closest

export const MAX_LEVEL = 10;

// One row per level. Levels 1-3 are meant for everyone (young kids included):
// mostly small pieces and most orders work. From level 4 the order starts to
// matter, from level 6 expert pieces join, and levels 8-10 usually leave only
// one or two working orders.
// Every round stays solvable in at least one order at every level.
const LEVELS = [
  //  easy medium hard expert  orders   tightness
  [75, 22, 3, 0, 4, 6, 0],     // 1
  [70, 26, 4, 0, 4, 6, 0],     // 2
  [62, 31, 7, 0, 3, 6, 0],     // 3
  [55, 34, 11, 0, 3, 6, 0.05], // 4
  [48, 37, 15, 0, 3, 6, 0.1],  // 5
  [40, 36, 19, 5, 3, 6, 0.2],  // 6
  [32, 36, 22, 10, 3, 5, 0.15], // 7
  [24, 35, 26, 15, 2, 4, 0.2],  // 8
  [17, 33, 30, 20, 1, 3, 0.4],  // 9
  [10, 30, 35, 25, 1, 2, 0.6],  // 10
];

// `mode` (classic, slide or gravity, see board.js) is passed on to the
// generator, which checks solvability with that mode's rules.
// All modes share this table. Measured with tools/curve.js (README): slide
// plays a little harder than classic, gravity somewhat easier.
export function difficultyForLevel(level, mode = 'classic') {
  const [easy, medium, hard, expert, min, max, tightness] = LEVELS[Math.min(Math.max(level, 1), MAX_LEVEL) - 1];
  return { level, mode, tierWeights: { easy, medium, hard, expert }, orders: { min, max }, tightness, candidates: 40 };
}

// Level rises with lines cleared: one level per LINES_PER_LEVEL lines, counted
// from the level the game started at (games saved before start levels started at 1).
export const LINES_PER_LEVEL = 8;

export function levelForProgress({ linesCleared, startLevel = 1 }) {
  return Math.min(MAX_LEVEL, startLevel + Math.floor(linesCleared / LINES_PER_LEVEL));
}
