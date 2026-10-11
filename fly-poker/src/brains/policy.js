/**
 * Action selection. The circuit emits logits; the fly's numeric style
 * (VPIP, PFR, aggression, bluff, fold-to-pressure) adds poker-theory bias.
 * Illegal actions are masked. Learned gains and opponent rates are inputs,
 * so a parameter update can change the next close decision.
 */

import { ACTIONS, forward } from './circuit.js';
import { planAmount } from '../poker/betting.js';
import { estimateEquity, potOdds, boardHeat, drawBonus } from '../poker/equity.js';
import { handPercentile, holeLabel, preflopBand } from '../poker/preflop.js';
import { neuromodulatorBias } from './neuromodulators.js';

const PREF = {
  'tight-aggressive': ['raise', 'bet', 'call', 'check', 'fold'],
  'loose-aggressive': ['raise', 'bet', 'call', 'check', 'fold'],
  'tight-passive': ['check', 'call', 'fold', 'bet', 'raise'],
  'loose-passive': ['call', 'check', 'fold', 'bet', 'raise'],
  maniac: ['raise', 'bet', 'call', 'check', 'fold'],
  copycat: ['call', 'check', 'fold', 'bet', 'raise'],
};

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function logAgg(aggression) {
  return Math.log(Math.max(aggression, 0.25));
}

function softmax(logits) {
  const vals = ACTIONS.map((a) => logits[a]);
  const m = Math.max(...vals);
  const exps = vals.map((v) => Math.exp(Math.max(-50, v - m)));
  const z = exps.reduce((s, v) => s + v, 0) || 1;
  return exps.map((v) => v / z);
}

function pickAction(logits, legal, style) {
  let best = null;
  let bestV = -Infinity;
  for (const action of PREF[style]) {
    if (!legal.includes(action)) continue;
    if (logits[action] > bestV) {
      bestV = logits[action];
      best = action;
    }
  }
  if (!best) throw new Error('no legal action');
  return best;
}

export function featurize(ctx) {
  const spr = ctx.stack / Math.max(ctx.pot, ctx.bigBlind);
  const draw = ctx.board.length >= 3 ? drawBonus(ctx.hole, ctx.board).bonus : 0;
  const street = ctx.street === 'preflop' ? 0 : ctx.street === 'flop' ? 0.33 : ctx.street === 'turn' ? 0.66 : 1;
  const bluffWindow = ctx.inPosition && ctx.toCall <= ctx.pot * 0.6 && ctx.equity < 0.42 && boardHeat(ctx.board) < 0.45 ? 1 : 0;
  return [
    clamp(ctx.equity, 0, 1),
    clamp(ctx.potOdds, 0, 1),
    spr / (spr + 4),
    street,
    ctx.inPosition ? 1 : 0,
    ctx.toCall / Math.max(ctx.stack + ctx.toCall, 1),
    boardHeat(ctx.board),
    clamp(draw / 0.2, 0, 1),
    clamp(ctx.oppAggression, 0, 1),
    clamp(ctx.oppVpip, 0, 1),
    clamp(ctx.invested, 0, 1),
    bluffWindow,
  ];
}

function applyStyle(ctx, logits, notes) {
  const params = ctx.params;
  const ag = logAgg(params.aggression);
  const facing = ctx.toCall > 0;
  if (ctx.street === 'preflop') {
    const bb = ctx.bigBlind;
    const facingOpen = ctx.currentBet > bb;
    const facingThreeBet = (ctx.raisesThisStreet || 0) >= 2;
    const commit = ctx.toCall / Math.max(ctx.stack + ctx.toCall, 1);
    const threeBetFrac = params.aggression >= 4 ? 0.85 : params.aggression >= 2.5 ? 0.4 : params.aggression >= 1.5 ? 0.28 : 0.15;
    if (!facing) {
      if (ctx.handPercentile <= params.pfr) {
        logits.raise += 2.1 + ag;
        notes.push('Unopened pot and the hand is inside the preflop-raise range');
      } else {
        logits.check += 1.6;
        logits.raise += params.bluff * 0.8;
        notes.push('Check is available and the hand is outside the raise range');
      }
    } else if (!facingOpen) {
      if (ctx.handPercentile <= params.pfr) {
        logits.raise += 2.2 + ag;
        logits.call += 0.3;
        notes.push('Open: hand is inside the preflop-raise range');
      } else if (ctx.handPercentile <= params.vpip) {
        logits.call += 1.6 - Math.max(0, ag) * 0.25;
        logits.raise += Math.max(0, ag) * 0.45;
        notes.push('Open: inside VPIP, outside the raise range');
      } else {
        logits.fold += 3.5;
        if (ctx.equity > ctx.potOdds && params.foldToPressure < 0.25) logits.call += 1;
        notes.push('Open: hand is outside VPIP');
      }
    } else if (facingThreeBet || commit >= 0.28) {
      const fourBetCutoff = params.pfr * (params.aggression >= 4 ? 0.5 : 0.16);
      const continueCutoff = commit >= 0.28
        ? params.pfr * (params.aggression >= 4 ? 0.45 : 0.22) * (1.15 - params.foldToPressure)
        : params.aggression >= 4
          ? params.vpip * 0.7
          : params.aggression < 1.2
            ? params.vpip * (params.foldToPressure > 0.7 ? 0.45 : 0.55)
            : params.pfr * 0.5;
      if (ctx.handPercentile <= fourBetCutoff && params.aggression >= 1.5) {
        logits.raise += 1.7 + ag;
        logits.call += 0.5;
        notes.push('Facing a reraise inside the 4-bet range');
      } else if (ctx.handPercentile <= continueCutoff) {
        logits.call += 1.5;
        logits.fold += params.foldToPressure * 0.35;
        notes.push('Facing a reraise inside the continue range');
      } else {
        logits.fold += 3.3 + params.foldToPressure;
        notes.push('Facing a reraise outside the continue range');
      }
    } else if (ctx.handPercentile <= params.pfr * threeBetFrac) {
      logits.raise += 2.1 + ag;
      logits.call += 0.55;
      logits.fold -= 1;
      notes.push('Facing an open inside the 3-bet range');
    } else if (ctx.handPercentile <= params.vpip * (params.aggression < 1.2 ? 0.9 : 0.65)) {
      logits.call += 1.7;
      logits.raise += Math.max(0, ag) * params.bluff;
      logits.fold += (params.foldToPressure - 0.25) * 0.45;
      notes.push('Facing an open inside the calling range');
    } else {
      logits.fold += 3.4;
      notes.push('Facing an open outside the calling range');
    }
    return;
  }

  if (!facing) {
    if (ctx.equity >= 0.74) {
      logits.bet += 1.6 + ag;
      logits.check += 0.35;
      notes.push('Strong made hand: value bet scaled by aggression');
    } else if (ctx.equity >= 0.5) {
      logits.check += 1.45;
      logits.bet += Math.max(0, ag) * (ctx.equity >= 0.62 ? 0.85 : 0.2);
      if (params.aggression >= 4 && params.bluff >= 0.4) logits.bet += 1.15;
      notes.push('Medium hand: check, unless it is strong or the bluff rate is high');
    } else {
      logits.check += 1.25;
      logits.bet += params.bluff * (ctx.inPosition ? 2.3 : 1);
      logits.bet += Math.max(0, ag) * (0.35 + params.bluff);
      notes.push('Weak hand: bluff frequency and position set the bet bias');
    }
    if (ctx.inPosition) logits.bet += 0.15 + params.bluff * 0.4;
    return;
  }

  const clearValue = ctx.equity >= Math.max(0.62, ctx.potOdds + 0.08);
  const close = Math.abs(ctx.equity - ctx.potOdds) <= 0.1 && !clearValue;
  if (clearValue) {
    logits.raise += 0.8 + ag;
    logits.call += 1.15;
    logits.fold -= 0.8;
    notes.push('Equity clears the bet: aggressive styles raise, passive styles call');
  } else if (close) {
    const foldPush = (params.foldToPressure - 0.4) * 4 + (ctx.oppAggression - 0.4) * 3.2;
    logits.fold += foldPush;
    logits.call += (0.45 - params.foldToPressure) * 4 + 0.35;
    logits.raise += params.bluff * Math.max(0, ag);
    notes.push(`Close spot: fold-to-pressure ${params.foldToPressure.toFixed(3)} and opponent aggression ${ctx.oppAggression.toFixed(3)} swing the call`);
  } else {
    logits.fold += 2 + params.foldToPressure * 2.2 + ctx.oppAggression * params.foldToPressure;
    logits.call += (1 - params.foldToPressure) * 1.3 + (ctx.equity / Math.max(ctx.potOdds, 0.05)) * 0.35;
    logits.raise += params.bluff * (1 + Math.max(0, ag));
    logits.fold -= params.bluff * 1.4;
    notes.push('Equity is behind the price: fold-to-pressure and bluff rate decide');
  }
  if (ctx.toCall >= ctx.pot * 0.6) {
    const rel = Math.min(2, ctx.toCall / Math.max(ctx.pot, 1));
    if (ctx.equity < 0.7) {
      logits.fold += params.foldToPressure * rel * 2.8;
      logits.call -= params.foldToPressure * rel * 1.1;
      notes.push(`Large bet (${rel.toFixed(2)}x pot) raises the fold requirement`);
    }
    if (ctx.equity < 0.48) {
      logits.fold += (0.48 - ctx.equity) * 4 + 0.9;
      logits.call -= 0.7;
      notes.push('Weak equity against a big bet');
    }
  }
  const stick = ctx.invested * (1 - params.foldToPressure);
  logits.fold -= stick * 1.6;
  logits.call += stick * 1.2;
  if (stick > 0.05) notes.push(`Already invested ${(ctx.invested * 100).toFixed(0)}% of the pot`);
}

function applyNeuromodulation(ctx, logits, notes) {
  const bias = neuromodulatorBias(ctx.neuromodulators);
  for (const [action, delta] of Object.entries(bias)) logits[action] += delta;
  const state = ctx.neuromodulators;
  if (!state) return;
  notes.push(
    `Small neuromodulator bias: octopamine ${state.octopamine.toFixed(2)}, reward ${state.reward.toFixed(2)}, punishment ${state.punishment.toFixed(2)}`,
  );
}

function desiredRaiseTo(ctx, action) {
  if (action !== 'bet' && action !== 'raise') return null;
  const frac = betFrac(ctx.params, ctx.equity);
  if (action === 'bet') {
    return ctx.streetBet + Math.max(ctx.bigBlind, Math.round(Math.max(ctx.pot, ctx.bigBlind) * frac));
  }
  if (ctx.street === 'preflop' && ctx.currentBet === ctx.bigBlind) {
    const mult = openMult(ctx.params);
    return Math.round(ctx.bigBlind * mult + ctx.bigBlind * ctx.limpers);
  }
  if (ctx.street === 'preflop') {
    return Math.round(ctx.currentBet * openMult(ctx.params));
  }
  const raiseBy = Math.max(ctx.minRaise, Math.round((ctx.pot + ctx.toCall) * frac));
  return ctx.currentBet + raiseBy;
}

function openMult(params) {
  if (params.aggression >= 4) return 4;
  if (params.aggression >= 2.5) return 3;
  if (params.aggression >= 1.5) return 2.5;
  return 2;
}

function betFrac(params, equity) {
  if (equity < 0.62) return params.aggression >= 4 ? 0.55 : 0.33;
  if (params.aggression >= 4) return 0.85;
  if (params.aggression >= 2.5) return equity >= 0.75 ? 0.8 : 0.7;
  if (params.aggression >= 1.5) return equity >= 0.75 ? 0.75 : 0.66;
  return equity >= 0.8 ? 0.55 : 0.45;
}

export function decide(ctx) {
  const equityPack = estimateEquity(ctx.hole, ctx.board, ctx.opponents);
  const equity = equityPack.equity;
  const odds = potOdds(ctx.toCall, ctx.pot);
  const percentile = ctx.board.length === 0 ? handPercentile(ctx.hole[0], ctx.hole[1]) : null;
  const label = holeLabel(ctx.hole[0], ctx.hole[1]);
  const handCategory = ctx.board.length === 0 ? preflopBand(ctx.hole[0], ctx.hole[1]) : equityPack.category;
  const handName = ctx.board.length === 0 ? `${label} (${handCategory})` : equityPack.name;
  const rich = { ...ctx, equity, potOdds: odds, handPercentile: percentile ?? 1 };
  const features = featurize(rich);
  const pass = forward(ctx.brain, features);
  const logits = { fold: 0, check: 0, call: 0, bet: 0, raise: 0 };
  for (let i = 0; i < ACTIONS.length; i++) logits[ACTIONS[i]] = pass.netLogits[i] * 1.4;
  const notes = [];
  let leaned = ACTIONS[0];
  let leanedV = -Infinity;
  for (const action of ACTIONS) {
    if (logits[action] > leanedV) {
      leanedV = logits[action];
      leaned = action;
    }
  }
  notes.push(`Hand: ${handName}`);
  notes.push(`Equity estimate ${(equity * 100).toFixed(0)}% vs pot odds ${(odds * 100).toFixed(0)}%`);
  if (equityPack.draws.length) notes.push(equityPack.draws.join(', '));
  notes.push(`Circuit readout leans ${leaned} (${leanedV.toFixed(2)}) before style bias`);
  applyStyle(rich, logits, notes);
  applyNeuromodulation(rich, logits, notes);
  if (ctx.facingName && ctx.toCall > 0) {
    notes.push(`${ctx.facingName}'s learned aggression ${ctx.oppAggression.toFixed(2)} is in the fold bias`);
  }
  if (ctx.bias) {
    for (const [action, pull] of Object.entries(ctx.bias)) logits[action] += pull;
    if (ctx.biasNote) notes.push(ctx.biasNote);
  }
  for (const action of ACTIONS) {
    if (!ctx.legal.includes(action)) logits[action] = -1e9;
  }
  const action = pickAction(logits, ctx.legal, ctx.style);
  const plan = planAmount(
    {
      stack: ctx.stack,
      streetBet: ctx.streetBet,
      toCall: ctx.toCall,
      currentBet: ctx.currentBet,
      minRaise: ctx.minRaise,
      bigBlind: ctx.bigBlind,
    },
    action,
    desiredRaiseTo(rich, action),
  );
  notes.push(`Chose ${action}${plan.amount ? ` for ${plan.amount}` : ''}`);
  const activity = features.concat(pass.drive.slice(features.length), softmax(logits));
  return {
    action,
    amount: plan.amount,
    raiseTo: plan.raiseTo,
    allIn: plan.allIn,
    street: ctx.street,
    handCategory,
    handName,
    equityEstimate: equity,
    potOdds: odds,
    toCall: ctx.toCall,
    pot: ctx.pot,
    logits,
    reasons: notes,
    legal: ctx.legal.slice(),
    handPercentile: percentile,
    activity,
    drive: pass.drive,
  };
}
