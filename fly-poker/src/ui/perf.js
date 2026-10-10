/** Frame-time sampler for the render loop. Not imported by the page yet. */

const BUDGET_MS = 32;
const WINDOW = 120;
const samples = new Float32Array(WINDOW);

let previous = -1;
let cursor = 0;
let count = 0;
let note = '';

/** Record one frame. Pass the rAF timestamp. Returns the delta in ms, or 0 on the first call. */
export function sampleFrame(time) {
  const now = typeof time === 'number' ? time : performance.now();
  let dt = 0;
  if (previous >= 0) {
    dt = now - previous;
    samples[cursor] = dt;
    cursor = (cursor + 1) % WINDOW;
    if (count < WINDOW) count += 1;
    if (dt > BUDGET_MS) note = `frame ${dt.toFixed(1)}ms exceeds ${BUDGET_MS}ms`;
  }
  previous = now;
  return dt;
}

/** Latest note for a frame over 32ms, or '' if none yet. */
export function frameNote() {
  return note;
}
