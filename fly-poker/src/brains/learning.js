/**
 * Per-hand update. Mutates synaptic gains, opponent-frequency counts, and
 * style thresholds inside a band around the loaded base style.
 * VPIP and PFR thresholds are not moved, so the five styles stay distinct.
 */

import { MOTOR0, nodeId } from './circuit.js';
import { smoothedRates } from './styles.js';

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function pushDelta(deltas, parameter, before, after, why) {
  const delta = after - before;
  if (Math.abs(delta) < 1e-8) return;
  deltas.push({ parameter, before, after, delta, why });
}

export function learnFromHand(fly, info) {
  const { chipsDelta, bb, events, priorsById, handNumber, selfId } = info;
  const names = info.names || {};
  const reward = Math.tanh(chipsDelta / (8 * bb));
  const deltas = [];
  const beforeRates = {};
  for (const id of Object.keys(fly.model)) beforeRates[id] = smoothedRates(fly.model[id], priorsById[id]);

  const flags = {};
  const raises = {};
  for (const ev of events) {
    if (ev.id === selfId) continue;
    const model = fly.model[ev.id];
    if (!model) continue;
    if (ev.action === 'bet') model.bets++;
    else if (ev.action === 'raise') model.raises++;
    else if (ev.action === 'call') model.calls++;
    else if (ev.action === 'fold') model.folds++;
    else if (ev.action === 'check') model.checks++;
    if (!flags[ev.id]) flags[ev.id] = { vpip: false, pfr: false };
    if (ev.street === 'preflop' && (ev.action === 'call' || ev.action === 'bet' || ev.action === 'raise')) flags[ev.id].vpip = true;
    if (ev.street === 'preflop' && (ev.action === 'bet' || ev.action === 'raise')) flags[ev.id].pfr = true;
    if (ev.action === 'bet' || ev.action === 'raise') raises[ev.id] = (raises[ev.id] || 0) + 1;
  }
  for (const id of Object.keys(flags)) {
    const model = fly.model[id];
    model.hands++;
    if (flags[id].vpip) model.vpip++;
    if (flags[id].pfr) model.pfr++;
  }
  for (const id of Object.keys(fly.model)) {
    const after = smoothedRates(fly.model[id], priorsById[id]);
    const name = names[id] || id;
    for (const stat of ['vpip', 'pfr', 'aggression', 'foldRate']) {
      pushDelta(
        deltas,
        `opp.${id}.${stat}`,
        beforeRates[id][stat],
        after[stat],
        `${name} ${stat} changed from actions seen this hand (${after.hands} hands in the model)`,
      );
    }
  }

  const learnRate = fly.params.learnRate;
  const pending = fly.pending;
  if (learnRate > 0 && reward !== 0 && pending.length > 0) {
    const width = pending[0].drive.length;
    const avg = new Array(width).fill(0);
    const chosenCounts = [0, 0, 0, 0, 0];
    for (const decision of pending) {
      for (let i = 0; i < width; i++) avg[i] += decision.drive[i];
      chosenCounts[decision.chosen] += 1;
    }
    for (let i = 0; i < width; i++) avg[i] /= pending.length;
    let primary = 0;
    for (let i = 1; i < chosenCounts.length; i++) if (chosenCounts[i] > chosenCounts[primary]) primary = i;
    const gainDeltas = [];
    for (const edge of fly.brain.edges) {
      const pre = avg[edge.from] || 0;
      let delta;
      if (edge.to >= MOTOR0) {
        const toward = edge.to - MOTOR0 === primary ? 1 : -0.35;
        delta = learnRate * reward * toward * pre;
      } else {
        delta = learnRate * reward * pre * (avg[edge.to] || 0);
      }
      if (Math.abs(delta) < 1e-8) continue;
      const before = edge.gain;
      edge.gain = clamp(before + delta, 0.02, 3);
      const applied = edge.gain - before;
      if (Math.abs(applied) < 1e-8) continue;
      gainDeltas.push({ edge, before, after: edge.gain, delta: applied });
    }
    gainDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    for (const row of gainDeltas.slice(0, 5)) {
      pushDelta(
        deltas,
        `gain:${nodeId(row.edge.from)}->${nodeId(row.edge.to)}`,
        row.before,
        row.after,
        `reward ${reward.toFixed(3)} from chips ${chipsDelta >= 0 ? '+' : ''}${chipsDelta} times mean presynaptic activity`,
      );
    }
  }

  let topFoe = null;
  let topRaises = 0;
  for (const id of Object.keys(raises)) {
    if (raises[id] > topRaises) {
      topRaises = raises[id];
      topFoe = id;
    }
  }
  const magnitude = Math.min(1, Math.abs(chipsDelta) / (10 * bb));
  if (learnRate > 0 && chipsDelta < 0 && topFoe) {
    const before = fly.params.foldToPressure;
    const step = learnRate * magnitude * 0.35;
    const lo = Math.max(0, fly.base.foldToPressure - 0.12);
    const hi = Math.min(1, fly.base.foldToPressure + 0.12);
    const after = clamp(before + step, lo, hi);
    fly.params.foldToPressure = after;
    pushDelta(
      deltas,
      'foldToPressure',
      before,
      after,
      `lost ${-chipsDelta} while ${names[topFoe] || topFoe} bet or raised ${topRaises} time(s)`,
    );
  }
  const myBets = events.filter((ev) => ev.id === selfId && (ev.action === 'bet' || ev.action === 'raise')).length;
  if (learnRate > 0 && chipsDelta > 0 && myBets > 0) {
    const before = fly.params.aggression;
    const step = learnRate * magnitude * before * 0.5;
    const lo = fly.base.aggression * 0.75;
    const hi = fly.base.aggression * 1.35;
    const after = clamp(before + step, lo, hi);
    fly.params.aggression = after;
    pushDelta(deltas, 'aggression', before, after, `won ${chipsDelta} with ${myBets} bet(s) or raise(s)`);
  }
  const bluffed = pending.some((decision) => decision.bluff);
  if (learnRate > 0 && bluffed && chipsDelta !== 0) {
    const before = fly.params.bluff;
    const step = learnRate * Math.sign(chipsDelta) * 0.25 * magnitude;
    const lo = Math.max(0, fly.base.bluff - 0.12);
    const hi = Math.min(1, fly.base.bluff + 0.12);
    const after = clamp(before + step, lo, hi);
    fly.params.bluff = after;
    pushDelta(
      deltas,
      'bluff',
      before,
      after,
      chipsDelta > 0 ? `bluff won ${chipsDelta}` : `bluff lost ${-chipsDelta}`,
    );
  }

  fly.pending = [];
  const record = {
    handNumber,
    chipsDelta,
    reward,
    summary: summarize(deltas, chipsDelta, names),
    deltas,
  };
  fly.learningLog.unshift(record);
<<<<<<< HEAD
  if (fly.learningLog.length > 8) fly.learningLog.length = 8;
=======
  if (fly.learningLog.length > 64) fly.learningLog.length = 64;
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
  return record;
}

function summarize(deltas, chipsDelta, names) {
  const style = deltas.find((d) => d.parameter === 'foldToPressure' || d.parameter === 'aggression' || d.parameter === 'bluff');
  if (style && style.parameter === 'foldToPressure') {
    const who = style.why.match(/while (.+) bet or raised/);
    const name = who ? who[1] : 'an opponent';
    return `${name} applied pressure — fold-to-pressure ${style.before.toFixed(3)} → ${style.after.toFixed(3)}`;
  }
  if (style) {
    return `${style.parameter} ${style.before.toFixed(3)} → ${style.after.toFixed(3)} after chips ${chipsDelta >= 0 ? '+' : ''}${chipsDelta}`;
  }
  const opp = deltas
    .filter((d) => d.parameter.startsWith('opp.'))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  if (opp) {
    const [, id, stat] = opp.parameter.split('.');
    const name = names[id] || id;
    return `${name} ${stat} ${opp.before.toFixed(3)} → ${opp.after.toFixed(3)}`;
  }
  const gain = deltas.find((d) => d.parameter.startsWith('gain:'));
  if (gain) return `Chips ${chipsDelta >= 0 ? '+' : ''}${chipsDelta} moved ${gain.parameter} by ${gain.delta.toFixed(4)}`;
  return 'No tracked parameter moved this hand';
}
