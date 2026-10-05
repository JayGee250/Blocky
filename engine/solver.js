import { SIZE, canPlace, cloneBoard, placeAndClear } from './board.js';

// Can the pieces be placed one after another in exactly this order,
// with line clears happening between placements?
export function solvableInOrder(rows, pieces) {
  if (pieces.length === 0) return true;
  const [first, ...rest] = pieces;
  for (let r = 0; r <= SIZE - first.height; r++) {
    for (let c = 0; c <= SIZE - first.width; c++) {
      if (!canPlace(rows, first, r, c)) continue;
      if (rest.length === 0) return true;
      const next = cloneBoard(rows);
      placeAndClear(next, first, r, c);
      if (solvableInOrder(next, rest)) return true;
    }
  }
  return false;
}

export function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const out = [];
  items.forEach((item, i) => {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

// For every ordering of `pieces` (all n! of them, identical pieces counted
// separately), report whether it can be fully placed. Identical orderings are
// solved once.
export function analyzeOrders(rows, pieces) {
  const cache = new Map();
  const orders = permutations(pieces.map((p, i) => ({ p, i }))).map((perm) => {
    const key = perm.map((x) => x.p.id).join(',');
    if (!cache.has(key)) cache.set(key, solvableInOrder(rows, perm.map((x) => x.p)));
    return { order: perm.map((x) => x.i), solvable: cache.get(key) };
  });
  const solvableCount = orders.filter((o) => o.solvable).length;
  return { orders, solvableCount, total: orders.length };
}

// Fast existence check: is there any order that works?
export function anyOrderSolvable(rows, pieces) {
  const tried = new Set();
  for (const perm of permutations(pieces)) {
    const key = perm.map((p) => p.id).join(',');
    if (tried.has(key)) continue;
    tried.add(key);
    if (solvableInOrder(rows, perm)) return true;
  }
  return false;
}
