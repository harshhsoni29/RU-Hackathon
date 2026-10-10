/**
 * Texas Hold'em hand rankings (standard high poker, best five cards):
 * straight flush (royal is the ace-high straight flush) >
 * four of a kind > full house > flush > straight >
 * three of a kind > two pair > one pair > high card.
 *
 * Wheel (A-2-3-4-5) is a five-high straight, not ace-high.
 * Broadway (A-K-Q-J-T) is the ace-high straight.
 * Ties compare kickers in order; equal scores split.
 */

import { rankIndex, toCard } from './cards.js';

const RANK_WORD = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'];

const SLUG = ['high-card', 'pair', 'two-pair', 'trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'];

export const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
};

function plural(index) {
  const word = RANK_WORD[index];
  return word === 'six' ? 'sixes' : `${word}s`;
}

function pack(category, kickers) {
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 15 + (kickers[i] || 0);
  return score;
}

function straightHighValue(uniqueAsc) {
  if (uniqueAsc.length !== 5) return 0;
  const wheel = uniqueAsc[0] === 0 && uniqueAsc[1] === 1 && uniqueAsc[2] === 2 && uniqueAsc[3] === 3 && uniqueAsc[4] === 12;
  if (wheel) return 5;
  if (uniqueAsc[4] - uniqueAsc[0] === 4) return uniqueAsc[4] + 2;
  return 0;
}

/**
 * Rank exactly five cards.
 * @returns {{category:number, slug:string, name:string, score:number, cards:object[]}}
 */
export function rankFive(ids) {
  if (ids.length !== 5) throw new Error('rankFive needs 5 cards');
  const ranks = ids.map(rankIndex).sort((a, b) => a - b);
  const counts = new Array(13).fill(0);
  const suits = new Array(4).fill(0);
  for (const id of ids) {
    counts[rankIndex(id)]++;
    suits[id & 3]++;
  }
  const flush = suits.some((n) => n === 5);
  const unique = [];
  for (let r = 0; r < 13; r++) if (counts[r]) unique.push(r);
  const straightHigh = straightHighValue(unique);
  const quads = [];
  const trips = [];
  const pairs = [];
  const singles = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
    else if (counts[r] === 1) singles.push(r);
  }
  const asValues = (idxs) => idxs.map((r) => r + 2);
  const cards = ids.map(toCard);

  let category;
  let kickers;
  let name;

  if (flush && straightHigh) {
    category = CATEGORY.STRAIGHT_FLUSH;
    kickers = [straightHigh];
    name = straightHigh === 14 ? 'royal flush' : `straight flush, ${RANK_WORD[straightHigh - 2]} high`;
  } else if (quads.length) {
    category = CATEGORY.QUADS;
    kickers = [quads[0] + 2, singles[0] + 2];
    name = `four of a kind, ${plural(quads[0])}`;
  } else if (trips.length && pairs.length) {
    category = CATEGORY.FULL_HOUSE;
    kickers = [trips[0] + 2, pairs[0] + 2];
    name = `full house, ${plural(trips[0])} full of ${plural(pairs[0])}`;
  } else if (flush) {
    category = CATEGORY.FLUSH;
    kickers = asValues(ranks.slice().reverse());
    name = `${RANK_WORD[ranks[4]]}-high flush`;
  } else if (straightHigh) {
    category = CATEGORY.STRAIGHT;
    kickers = [straightHigh];
    if (straightHigh === 14) name = 'broadway';
    else if (straightHigh === 5) name = 'straight, five high';
    else name = `straight, ${RANK_WORD[straightHigh - 2]} high`;
  } else if (trips.length) {
    category = CATEGORY.TRIPS;
    kickers = [trips[0] + 2, ...asValues(singles)];
    name = `three of a kind, ${plural(trips[0])}`;
  } else if (pairs.length >= 2) {
    category = CATEGORY.TWO_PAIR;
    kickers = [pairs[0] + 2, pairs[1] + 2, singles[0] + 2];
    name = `two pair, ${plural(pairs[0])} and ${plural(pairs[1])}`;
  } else if (pairs.length === 1) {
    category = CATEGORY.PAIR;
    kickers = [pairs[0] + 2, ...asValues(singles)];
    name = `pair of ${plural(pairs[0])}`;
  } else {
    category = CATEGORY.HIGH_CARD;
    kickers = asValues(ranks.slice().reverse());
    name = `${RANK_WORD[ranks[4]]} high`;
  }

  let slug = SLUG[category];
  if (name === 'royal flush') slug = 'royal-flush';
  else if (category === CATEGORY.STRAIGHT && straightHigh === 14) slug = 'broadway';
  else if (category === CATEGORY.STRAIGHT && straightHigh === 5) slug = 'wheel';
  return { category, slug, name, score: pack(category, kickers), cards };
}

function nextCombo(idx, n) {
  let i = 4;
  while (i >= 0 && idx[i] === n - 5 + i) i--;
  if (i < 0) return false;
  idx[i]++;
  for (let j = i + 1; j < 5; j++) idx[j] = idx[j - 1] + 1;
  return true;
}

/** Best five-card hand from 5, 6, or 7 cards. */
export function evaluate(ids) {
  if (ids.length < 5 || ids.length > 7) throw new Error(`evaluate needs 5-7 cards, got ${ids.length}`);
  if (ids.length === 5) return rankFive(ids);
  const idx = [0, 1, 2, 3, 4];
  let best = null;
  do {
    const five = [ids[idx[0]], ids[idx[1]], ids[idx[2]], ids[idx[3]], ids[idx[4]]];
    const ranked = rankFive(five);
    if (!best || ranked.score > best.score) best = ranked;
  } while (nextCombo(idx, ids.length));
  return best;
}

export function compareScores(a, b) {
  return a.score - b.score;
}
