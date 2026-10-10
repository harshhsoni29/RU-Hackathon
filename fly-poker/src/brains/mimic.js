/**
 * Soni's social-learning layer. Each hand Soni samples one other fly to follow
 * (softmax over learned preferences), plays with that fly's style, and is pulled
 * toward repeating that fly's latest action by a learned copy strength.
 *
 * After the hand:
 *   - the followed fly's preference moves with Soni's own reward (direct credit),
 *   - every fly's preference moves a little with that fly's own result (observational learning),
 *   - copy strength rises when copying paid and falls when it cost chips.
 */

const PREF_RATE = 0.8;      // direct credit to the fly Soni followed
const WATCH_RATE = 0.25;    // vicarious credit from watching every other fly's result
const COPY_RATE = 0.08;     // copy-strength step per hand
const COPY_FLOOR = 0.1;     // Soni never stops copying entirely
const PREF_LIMIT = 4;       // keeps the softmax from collapsing onto one fly forever
const COPY_PULL = 4;        // logit bonus for the copied action at copy strength 1

const MIRROR = {
  fold: ['fold'],
  check: ['check', 'call'],
  call: ['call', 'check'],
  bet: ['bet', 'raise'],
  raise: ['raise', 'bet'],
};

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function emptyMimic(ids) {
  return { prefs: Object.fromEntries(ids.map((id) => [id, 0])), copy: 0.5, mentor: null, copied: 0, decisions: 0 };
}

/** Probability of following each fly next hand. */
export function followShares(mimic, ids = Object.keys(mimic.prefs)) {
  const exps = ids.map((id) => Math.exp(mimic.prefs[id] || 0));
  const z = exps.reduce((s, v) => s + v, 0) || 1;
  return Object.fromEntries(ids.map((id, i) => [id, exps[i] / z]));
}

export function pickMentor(mimic, candidates, random) {
  if (!candidates.length) return null;
  const shares = followShares(mimic, candidates);
  let r = random();
  for (const id of candidates) {
    r -= shares[id];
    if (r <= 0) return id;
  }
  return candidates[candidates.length - 1];
}

/** The mentor's latest action this hand, mapped onto what Soni may legally do. */
export function copyTarget(log, mentorId, street, legal) {
  const mine = log.filter((ev) => ev.id === mentorId);
  const latest = mine.filter((ev) => ev.street === street).pop() || mine.pop();
  if (!latest) return null;
  const action = (MIRROR[latest.action] || []).find((a) => legal.includes(a));
  return action ? { action, seen: latest.action, street: latest.street } : null;
}

export function copyBias(mimic, target) {
  return target ? { [target.action]: COPY_PULL * mimic.copy } : null;
}

/**
 * reward: Soni's tanh-scaled chip result. results: { flyId: tanh-scaled chip result } for the
 * other flies that played. copiedShare: fraction of Soni's decisions that matched the copy target.
 */
export function learnMimic(mimic, { reward, results, copiedShare, names }) {
  const deltas = [];
  const ids = Object.keys(mimic.prefs);
  const before = followShares(mimic, ids);
  for (const id of ids) {
    const direct = id === mimic.mentor ? PREF_RATE * reward : 0;
    const watched = WATCH_RATE * (results[id] || 0);
    mimic.prefs[id] = clamp(mimic.prefs[id] + direct + watched, -PREF_LIMIT, PREF_LIMIT);
  }
  const after = followShares(mimic, ids);
  for (const id of ids) {
    if (Math.abs(after[id] - before[id]) < 1e-4) continue;
    const why = id === mimic.mentor
      ? `followed ${names[id] || id} and ${reward >= 0 ? 'won' : 'lost'} chips`
      : `watched ${names[id] || id} ${(results[id] || 0) >= 0 ? 'do well' : 'lose chips'}`;
    deltas.push({ parameter: `follow.${id}`, before: before[id], after: after[id], delta: after[id] - before[id], why });
  }
  if (copiedShare > 0 && reward !== 0) {
    const was = mimic.copy;
    mimic.copy = clamp(was + COPY_RATE * reward * copiedShare, COPY_FLOOR, 0.95);
    if (Math.abs(mimic.copy - was) > 1e-6) {
      deltas.push({
        parameter: 'copyStrength',
        before: was,
        after: mimic.copy,
        delta: mimic.copy - was,
        why: `copying ${names[mimic.mentor] || mimic.mentor} ${reward > 0 ? 'paid off' : 'cost chips'}`,
      });
    }
  }
  return deltas;
}
