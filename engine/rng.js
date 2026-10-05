// Small seeded PRNG (mulberry32) so games and tests are reproducible.
// `state` can be saved and passed back in to resume the exact same sequence.
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    get state() { return a; },
    int: (n) => Math.floor(next() * n),
    // Pick an item from [{ item, weight }] proportionally to weight.
    weighted(entries) {
      let total = 0;
      for (const e of entries) total += e.weight;
      let r = next() * total;
      for (const e of entries) {
        r -= e.weight;
        if (r < 0) return e.item;
      }
      return entries[entries.length - 1].item;
    },
  };
}
