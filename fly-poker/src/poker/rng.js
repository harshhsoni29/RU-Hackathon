/** Mulberry32. Returns a float in [0, 1). State stays on the closure. */

export function makeRng(seed) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      state = (t ^ (t >>> 14)) >>> 0;
      return state / 4294967296;
    },
  };
}
