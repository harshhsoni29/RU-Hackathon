/**
 * Preflop hand order uses the published Chen formula (Bill Chen):
 * base A=10,K=8,Q=7,J=6,T..2 = half face value; pairs double (minimum 5);
 * suited +2; gap penalties 1/2/4/5; extra -1 if gapped below queen;
 * +1 for connector or one-gapper when both cards are below queen.
 * Percentile is the fraction of the 1326 combinations with a strictly higher score.
 */

import { rankIndex, suitIndex } from './cards.js';

const BASE = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10];
const QUEEN = 10;

export function chenScore(c1, c2) {
  let a = rankIndex(c1);
  let b = rankIndex(c2);
  if (a < b) {
    const t = a;
    a = b;
    b = t;
  }
  if (a === b) return Math.max(5, BASE[a] * 2);
  let score = BASE[a];
  if (suitIndex(c1) === suitIndex(c2)) score += 2;
  const gap = a - b - 1;
  if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else if (gap >= 4) score -= 5;
  if (gap >= 1 && a < QUEEN) score -= 1;
  if (gap <= 1 && a < QUEEN) score += 1;
  return score;
}

const percentile = new Map();
const chenByKey = new Map();

function keyOf(c1, c2) {
  return c1 < c2 ? `${c1},${c2}` : `${c2},${c1}`;
}

const allScores = [];
for (let i = 0; i < 52; i++) {
  for (let j = i + 1; j < 52; j++) {
    const score = chenScore(i, j);
    const key = `${i},${j}`;
    chenByKey.set(key, score);
    allScores.push(score);
  }
}
allScores.sort((a, b) => a - b);
for (let i = 0; i < 52; i++) {
  for (let j = i + 1; j < 52; j++) {
    const score = chenByKey.get(`${i},${j}`);
    let better = 0;
    for (let k = allScores.length - 1; k >= 0 && allScores[k] > score; k--) better++;
    percentile.set(`${i},${j}`, better / 1326);
  }
}

export function holeKey(c1, c2) {
  return keyOf(c1, c2);
}

/** 0 = best hand in the deck (aces), near 1 = worst. */
export function handPercentile(c1, c2) {
  return percentile.get(keyOf(c1, c2));
}

export function holeChen(c1, c2) {
  return chenByKey.get(keyOf(c1, c2));
}

const RANK_CHAR = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export function holeLabel(c1, c2) {
  const r1 = rankIndex(c1);
  const r2 = rankIndex(c2);
  if (r1 === r2) return RANK_CHAR[r1] + RANK_CHAR[r2];
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const suited = suitIndex(c1) === suitIndex(c2);
  return RANK_CHAR[hi] + RANK_CHAR[lo] + (suited ? 's' : 'o');
}

export function preflopBand(c1, c2) {
  const score = holeChen(c1, c2);
  if (score >= 12) return 'premium';
  if (score >= 9) return 'strong';
  if (score >= 6) return 'playable';
  return 'weak';
}

/** Rough equity versus one random hand, from the Chen score. An estimate, not an enumeration. */
export function preflopEquityVsOne(c1, c2) {
  const score = holeChen(c1, c2);
  return clamp(0.34 + score * 0.026, 0.3, 0.86);
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
