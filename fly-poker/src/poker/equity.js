/**
 * Fast equity estimate for decisions and the inspection panel.
 * Preflop: Chen score mapped to equity versus one random hand, then a multiway penalty.
 * Postflop: made-hand category, kickers, and draw outs. This is not a full Monte Carlo solve.
 */

import { rankIndex } from './cards.js';
import { evaluate, CATEGORY } from './evaluator.js';
import { preflopEquityVsOne } from './preflop.js';

const MADE = {
  [CATEGORY.HIGH_CARD]: 0.28,
  [CATEGORY.PAIR]: 0.55,
  [CATEGORY.TWO_PAIR]: 0.72,
  [CATEGORY.TRIPS]: 0.82,
  [CATEGORY.STRAIGHT]: 0.86,
  [CATEGORY.FLUSH]: 0.9,
  [CATEGORY.FULL_HOUSE]: 0.96,
  [CATEGORY.QUADS]: 0.99,
  [CATEGORY.STRAIGHT_FLUSH]: 1,
};

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function uniqueRanks(ids) {
  const set = new Set();
  for (const id of ids) set.add(rankIndex(id));
  return set;
}

/** Draw extras on the flop or turn. Returns an equity bonus and a short label list. */
export function drawBonus(hole, board) {
  const notes = [];
  if (board.length < 3 || board.length > 4) return { bonus: 0, notes };
  const all = hole.concat(board);
  const streetsLeft = board.length === 3 ? 2 : 1;
  const scale = streetsLeft === 2 ? 1 : 0.5;
  let bonus = 0;

  const suitCounts = [0, 0, 0, 0];
  const holeSuits = [0, 0, 0, 0];
  for (const id of all) suitCounts[id & 3]++;
  for (const id of hole) holeSuits[id & 3]++;
  const flush = suitCounts.some((n) => n >= 5);
  if (!flush) {
    for (let s = 0; s < 4; s++) {
      if (suitCounts[s] === 4 && holeSuits[s] > 0) {
        bonus += 0.18 * scale;
        notes.push(streetsLeft === 2 ? 'flush draw' : 'flush draw, one card');
        break;
      }
    }
  }

  const have = uniqueRanks(all);
  const madeStraight = hasStraight(have);
  if (!madeStraight) {
    let open = false;
    let gut = false;
    for (let low = 0; low <= 8; low++) {
      const window = [low, low + 1, low + 2, low + 3, low + 4];
      const missing = window.filter((r) => !have.has(r));
      if (missing.length !== 1) continue;
      const miss = missing[0];
      if (miss === window[0] || miss === window[4]) open = true;
      else gut = true;
    }
    const wheel = [12, 0, 1, 2, 3];
    const wheelMiss = wheel.filter((r) => !have.has(r));
    if (wheelMiss.length === 1) gut = true;
    if (open) {
      bonus += 0.16 * scale;
      notes.push('open-ended straight draw');
    } else if (gut) {
      bonus += 0.08 * scale;
      notes.push('gutshot');
    }
  }

  if (board.length >= 3 && hole.length === 2) {
    const boardRanks = board.map(rankIndex);
    const top = Math.max(...boardRanks);
    const h1 = rankIndex(hole[0]);
    const h2 = rankIndex(hole[1]);
    if (h1 !== h2 && h1 > top && h2 > top && !madeStraight && !flush) {
      bonus += 0.06 * scale;
      notes.push('two overcards');
    }
  }
  return { bonus, notes };
}

function hasStraight(have) {
  const asc = [...have].sort((a, b) => a - b);
  if (have.has(12) && have.has(0) && have.has(1) && have.has(2) && have.has(3)) return true;
  for (let i = 0; i <= asc.length - 5; i++) {
    if (asc[i + 4] - asc[i] === 4) return true;
  }
  return false;
}

export function boardHeat(board) {
  if (board.length < 3) return 0;
  const counts = new Array(13).fill(0);
  const suits = new Array(4).fill(0);
  for (const id of board) {
    counts[rankIndex(id)]++;
    suits[id & 3]++;
  }
  let heat = 0;
  if (counts.some((n) => n >= 2)) heat += 0.35;
  if (counts.some((n) => n >= 3)) heat += 0.25;
  if (suits.some((n) => n >= 3)) heat += 0.25;
  if (suits.some((n) => n >= 4)) heat += 0.2;
  const ranks = [];
  for (let r = 0; r < 13; r++) if (counts[r]) ranks.push(r);
  for (let i = 0; i < ranks.length - 2; i++) {
    if (ranks[i + 2] - ranks[i] <= 4) heat += 0.15;
  }
  return clamp(heat, 0, 1);
}

export function multiway(eqOne, opponents) {
  if (opponents <= 1) return clamp(eqOne, 0.02, 0.98);
  const exp = 1 + (opponents - 1) * 0.55;
  return clamp(eqOne ** exp, 0.02, 0.98);
}

/**
 * @returns {{equity:number, category:string, name:string, draws:string[]}}
 */
export function estimateEquity(hole, board, opponents) {
  if (hole.length !== 2) throw new Error('equity needs two hole cards');
  if (board.length === 0) {
    const eq = multiway(preflopEquityVsOne(hole[0], hole[1]), opponents);
    return { equity: eq, category: null, name: null, draws: [] };
  }
  const ranked = evaluate(hole.concat(board));
  let eq = MADE[ranked.category];
  const kick = (ranked.score % 15 ** 5) / 15 ** 5;
  eq += Math.min(0.04, kick * 0.04);
  const draws = drawBonus(hole, board);
  if (ranked.category < CATEGORY.STRAIGHT) eq += draws.bonus;
  if (ranked.category <= CATEGORY.PAIR) eq = Math.min(eq, 0.66);
  else if (ranked.category === CATEGORY.TWO_PAIR) eq = Math.min(eq, 0.84);
  if (ranked.category === CATEGORY.PAIR && boardHeat(board) > 0.5) eq -= 0.06;
  eq = multiway(clamp(eq, 0.05, 0.99), opponents);
  return { equity: eq, category: ranked.slug, name: ranked.name, draws: draws.notes };
}

export function potOdds(toCall, pot) {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}
