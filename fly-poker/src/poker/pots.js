/**
 * Side pots from committed chips.
 * A folded player's chips stay in the pot; only non-folded players who matched
 * that layer can win it. Odd chips go clockwise starting left of the button.
 */

import { evaluate } from './evaluator.js';

export function buildPots(players) {
  const levels = [];
  for (const p of players) {
    if (p.totalCommitted > 0 && !levels.includes(p.totalCommitted)) levels.push(p.totalCommitted);
  }
  levels.sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    const involved = players.filter((p) => p.totalCommitted >= level);
    const amount = (level - prev) * involved.length;
    const eligible = involved.filter((p) => p.inHand && !p.folded).map((p) => p.id);
    if (amount > 0) {
      if (eligible.length === 0) throw new Error('pot layer has no eligible winner');
      pots.push({ amount, eligible });
    }
    prev = level;
  }
  const committed = players.reduce((s, p) => s + p.totalCommitted, 0);
  const built = pots.reduce((s, p) => s + p.amount, 0);
  if (built !== committed) throw new Error(`side pots ${built} != committed ${committed}`);
  return pots;
}

function orderFromLeftOfButton(ids, players, button) {
  const wanted = new Set(ids);
  const n = players.length;
  const ordered = [];
  for (let k = 1; k <= n; k++) {
    const i = (button + k) % n;
    if (wanted.has(players[i].id)) ordered.push(players[i].id);
  }
  return ordered;
}

function payLayer(amount, winnerIds, players, button) {
  const ordered = orderFromLeftOfButton(winnerIds, players, button);
  const share = Math.floor(amount / ordered.length);
  let rem = amount - share * ordered.length;
  const pays = [];
  for (const id of ordered) {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem--;
    pays.push({ id, amount: share + extra });
  }
  return pays;
}

/**
 * Does not move chips. Returns payments that sum to every committed chip.
 * showdown requires a 5-card board and at least two eligible players in some layer
 * only when a layer has more than one eligible player.
 */
export function settlePots(players, button, board, showdown) {
  const pots = buildPots(players);
  const byId = new Map(players.map((p) => [p.id, p]));
  const scoreCache = new Map();
  const totals = new Map();
  const showed = [];
  const potResults = [];

  function scoreOf(id) {
    if (scoreCache.has(id)) return scoreCache.get(id);
    const p = byId.get(id);
    if (!showdown) {
      const empty = { score: 0, name: null, slug: 'uncontested', category: null };
      scoreCache.set(id, empty);
      return empty;
    }
    const ranked = evaluate(p.hole.concat(board));
    const row = { score: ranked.score, name: ranked.name, slug: ranked.slug, category: ranked.category };
    scoreCache.set(id, row);
    return row;
  }

  if (showdown) {
    for (const p of players) {
      if (p.inHand && !p.folded) {
        const s = scoreOf(p.id);
        showed.push({ id: p.id, handName: s.name, category: s.slug, score: s.score });
      }
    }
  }

  for (const pot of pots) {
    let best = -Infinity;
    let winners = [];
    if (!showdown || pot.eligible.length === 1) {
      winners = pot.eligible.slice();
    } else {
      for (const id of pot.eligible) {
        const score = scoreOf(id).score;
        if (score > best) {
          best = score;
          winners = [id];
        } else if (score === best) winners.push(id);
      }
    }
    const pays = payLayer(pot.amount, winners, players, button);
    for (const pay of pays) totals.set(pay.id, (totals.get(pay.id) || 0) + pay.amount);
    potResults.push({
      amount: pot.amount,
      winners: pays.map((pay) => {
        const s = scoreOf(pay.id);
        return {
          id: pay.id,
          amount: pay.amount,
          handName: showdown ? s.name : null,
          category: showdown ? s.slug : 'uncontested',
          score: showdown ? s.score : null,
        };
      }),
    });
  }

  const payments = [...totals.entries()].map(([id, amount]) => ({ id, amount }));
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const committed = players.reduce((s, p) => s + p.totalCommitted, 0);
  if (paid !== committed) throw new Error(`settlement paid ${paid} != committed ${committed}`);
  return { pots: potResults, payments, showed };
}
