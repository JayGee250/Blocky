// Plays games with a simple bot to check generator speed, how often rounds
// land in the difficulty band, and how long games last.
//   node tools/simulate.js [games=20] [skill=0.9]
// skill = chance the bot checks that a move keeps the rest of the round placeable.
import { newGame, place, trayPieces, placements, cloneBoard, placeAndClear, anyOrderSolvable, createRng } from '../engine/index.js';

const games = Number(process.argv[2] || 20);
const skill = Number(process.argv[3] || 0.9);
const MAX_MOVES = 1500;

function botMove(state, rng) {
  const tray = trayPieces(state);
  const moves = [];
  tray.forEach((t, slot) => {
    if (t.used) return;
    for (const [r, c] of placements(state.board, t.piece)) moves.push({ slot, r, c, piece: t.piece });
  });
  if (rng.next() >= skill) return moves[rng.int(moves.length)];
  let best = null;
  for (const m of moves) {
    const b = cloneBoard(state.board);
    const { clearedRows, clearedCols } = placeAndClear(b, m.piece, m.r, m.c);
    const rest = tray.filter((t, i) => !t.used && i !== m.slot).map((t) => t.piece);
    if (rest.length && !anyOrderSolvable(b, rest)) continue;
    const value = (clearedRows.length + clearedCols.length) * 10 + rng.next();
    if (!best || value > best.value) best = { ...m, value };
  }
  return best || moves[0];
}

const rng = createRng(12345);
const byLevel = {};
let dealTime = 0, deals = 0;
const results = [];
for (let g = 0; g < games; g++) {
  const state = newGame({ seed: 1000 + g });
  let lastRounds = state.rounds;
  while (!state.gameOver && state.moves < MAX_MOVES) {
    const m = botMove(state, rng);
    const level = state.level;
    const t0 = performance.now();
    place(state, m.slot, m.r, m.c);
    if (state.rounds !== lastRounds) {
      dealTime += performance.now() - t0; deals++; lastRounds = state.rounds;
      const s = (byLevel[level] ||= { rounds: 0, inBand: 0, orders: 0 });
      s.rounds++; s.inBand += state.lastRound.inBand ? 1 : 0; s.orders += state.lastRound.solvableOrders;
    }
  }
  results.push({ score: state.score, moves: state.moves, level: state.level, ended: state.gameOver });
}

console.log(`games=${games} skill=${skill}`);
console.log(`avg placement+deal time: ${(dealTime / deals).toFixed(2)} ms over ${deals} deals`);
console.log('level  rounds  inBand%  avgSolvableOrders');
for (const [lvl, s] of Object.entries(byLevel)) {
  console.log(`${lvl.padStart(5)}  ${String(s.rounds).padStart(6)}  ${(100 * s.inBand / s.rounds).toFixed(0).padStart(7)}  ${(s.orders / s.rounds).toFixed(2).padStart(17)}`);
}
const avg = (k) => (results.reduce((n, r) => n + r[k], 0) / results.length).toFixed(0);
console.log(`avg score ${avg('score')}, avg moves ${avg('moves')}, avg final level ${avg('level')}, ended ${results.filter((r) => r.ended).length}/${games} (others hit ${MAX_MOVES} moves)`);
