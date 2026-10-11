/**
 * Small, bounded state variables inspired by insect neuromodulation.
 *
 * These are model variables, not measured transmitter concentrations or a
 * simulation of identified Drosophila cells. They add only a small logit bias
 * after the circuit and poker-style terms have been evaluated.
 */

const MIN = 0.12;
const MAX = 0.88;
const BASELINE = 0.5;

function clamp(x, lo = MIN, hi = MAX) {
  return Math.max(lo, Math.min(hi, x));
}

function moveToward(value, target, rate) {
  return clamp(value + (target - value) * rate);
}

export function createNeuromodulators() {
  return { octopamine: BASELINE, reward: BASELINE, punishment: BASELINE };
}

/** Small action biases from the model's current state (each is at most 0.12 logits). */
export function neuromodulatorBias(state) {
  const octopamine = (state?.octopamine ?? BASELINE) - BASELINE;
  const reward = (state?.reward ?? BASELINE) - BASELINE;
  const punishment = (state?.punishment ?? BASELINE) - BASELINE;
  const clean = (value) => (Math.abs(value) < 1e-12 ? 0 : value);
  return {
    fold: clean(punishment * 0.24 - reward * 0.08),
    check: clean(-octopamine * 0.08),
    call: clean(reward * 0.12 - punishment * 0.16),
    bet: clean(octopamine * 0.20 + reward * 0.06),
    raise: clean(octopamine * 0.24 + reward * 0.08),
  };
}

/**
 * Update the proxies once per hand. Reward is the same bounded chip outcome
 * used by the connection-gain rule; pressure is only elevated after losing a
 * call into an opponent's bet or raise. The deliberately slow updates keep
 * this layer subordinate to the circuit and poker policy.
 */
export function updateNeuromodulators(state, { reward, lostToHeat, aggression }) {
  const before = { ...state };
  const aggressiveShare = Math.max(0, Math.min(1, aggression || 0));
  state.reward = moveToward(state.reward, BASELINE + reward * 0.35, 0.18);
  state.punishment = moveToward(
    state.punishment,
    BASELINE + (lostToHeat ? 0.3 : reward < 0 ? 0.1 : -0.1),
    0.16,
  );
  state.octopamine = moveToward(
    state.octopamine,
    BASELINE + (aggressiveShare - 0.5) * 0.2 + reward * 0.08,
    0.14,
  );
  return { before, after: { ...state } };
}
