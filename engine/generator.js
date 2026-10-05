import { PIECES } from './pieces.js';
import { fitsAnywhere, placements } from './board.js';
import { analyzeOrders, anyOrderSolvable, permutations } from './solver.js';

const TIERS = ['easy', 'medium', 'hard'];

// Deals a round of `count` pieces that can all be placed on `rows` in at least
// one order. Within that guarantee it aims for the difficulty's order band
// (how many of the orderings work) and piece mix.
//
// Returns { pieces, solvableOrders, totalOrders, inBand }.
export function dealRound(rows, rng, difficulty, count = 3) {
  const pool = buildPool(rows, difficulty);
  const { min, max } = difficulty.orders;
  // Tightness sets how many in-band rounds are compared before keeping the one
  // whose pieces have the fewest spots to go: 1 at tightness 0 (plain random
  // pick), all `candidates` at tightness 1.
  const compare = 1 + Math.round(difficulty.tightness * (difficulty.candidates - 1));
  let best = null;
  let inBandSeen = 0;

  for (let i = 0; i < difficulty.candidates && inBandSeen < compare; i++) {
    const pieces = Array.from({ length: count }, () => rng.weighted(pool));
    const { solvableCount, total } = analyzeOrders(rows, pieces);
    if (solvableCount === 0) continue;

    // Orders are counted out of 6; scale the band if count differs.
    const scale = total / 6;
    const distance = solvableCount < min * scale ? min * scale - solvableCount
      : solvableCount > max * scale ? solvableCount - max * scale : 0;
    if (distance === 0) inBandSeen++;
    const looseness = compare > 1 ? spotsAvailable(rows, pieces) : 0;
    const cost = distance * 1000 + looseness;

    if (!best || cost < best.cost) best = { pieces, solvableCount, total, cost, inBand: distance === 0 };
  }

  if (!best) best = fallbackRound(rows, rng, count);
  return { pieces: best.pieces, solvableOrders: best.solvableCount, totalOrders: best.total, inBand: !!best.inBand };
}

// Pieces that fit somewhere right now, weighted so each tier's total share
// matches tierWeights (tiers with nothing that fits drop out).
function buildPool(rows, difficulty) {
  const fitting = PIECES.filter((p) => fitsAnywhere(rows, p));
  const pool = [];
  for (const tier of TIERS) {
    const inTier = fitting.filter((p) => p.tier === tier);
    const w = difficulty.tierWeights[tier] || 0;
    if (!inTier.length || w <= 0) continue;
    for (const p of inTier) pool.push({ item: p, weight: w / inTier.length });
  }
  if (!pool.length) for (const p of fitting) pool.push({ item: p, weight: 1 });
  return pool;
}

function spotsAvailable(rows, pieces) {
  return pieces.reduce((n, p) => n + placements(rows, p).length, 0);
}

// Used when random sampling found nothing solvable (a very crowded board).
// Tries the smallest pieces first; three single dots always work because the
// board can never be completely full.
function fallbackRound(rows, rng, count) {
  const fitting = PIECES.filter((p) => fitsAnywhere(rows, p)).sort((a, b) => a.size - b.size || rng.next() - 0.5);
  const small = fitting.slice(0, 8);
  for (let attempt = 0; attempt < 60; attempt++) {
    const pieces = Array.from({ length: count }, () => small[rng.int(small.length)]);
    if (anyOrderSolvable(rows, pieces)) {
      const { solvableCount, total } = analyzeOrders(rows, pieces);
      return { pieces, solvableCount, total };
    }
  }
  const dot = PIECES.find((p) => p.id === 'dot');
  const pieces = Array(count).fill(dot);
  return { pieces, solvableCount: permutations(pieces).length, total: permutations(pieces).length };
}
