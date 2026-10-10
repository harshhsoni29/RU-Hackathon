/**
 * No-limit hold'em betting for one street.
 * Check is illegal facing a bet. A bet opens; a raise increases the current bet.
 * Minimum raise increment starts at the big blind and becomes the size of the
 * last full bet or raise. An all-in that is less than a full raise does not
 * reopen raising for players who already acted; they may still call or fold.
 */

export function toCall(hand, seat) {
  return Math.max(0, hand.currentBet - hand.players[seat].streetBet);
}

export function legalActions(hand, seat) {
  const p = hand.players[seat];
  if (!p || !p.inHand || p.folded || p.allIn) return [];
  const owed = hand.currentBet - p.streetBet;
  if (owed <= 0) {
    const actions = ['check'];
    if (p.stack > 0 && hand.currentBet === 0) actions.push('bet');
    if (p.stack > 0 && hand.currentBet > 0 && p.raiseAllowed) actions.push('raise');
    return actions;
  }
  const actions = ['fold'];
  if (p.stack > 0) actions.push('call');
  if (p.stack > owed && p.raiseAllowed) actions.push('raise');
  return actions;
}

/** Chip plan shared by the brain and applyAction so a quoted size is the size that is bet. */
export function planAmount(state, action, desiredRaiseTo) {
  if (action === 'fold' || action === 'check') return { amount: 0, raiseTo: null, allIn: false };
  if (action === 'call') {
    const amount = Math.min(state.stack, state.toCall);
    return { amount, raiseTo: state.streetBet + amount, allIn: amount >= state.stack && amount > 0 };
  }
  const maxTo = state.streetBet + state.stack;
  const minTo = action === 'bet'
    ? Math.min(state.bigBlind, maxTo)
    : Math.min(state.currentBet + state.minRaise, maxTo);
  let raiseTo = desiredRaiseTo == null ? minTo : Math.round(desiredRaiseTo);
  if (raiseTo < minTo) raiseTo = minTo;
  if (raiseTo > maxTo) raiseTo = maxTo;
  const amount = raiseTo - state.streetBet;
  return { raiseTo, amount, allIn: amount >= state.stack };
}

export function roundComplete(hand) {
  const live = hand.players.filter((p) => p.inHand && !p.folded);
  if (live.length <= 1) return true;
  return hand.players.every((p) => {
    if (!p.inHand || p.folded || p.allIn) return true;
    return p.acted && p.streetBet === hand.currentBet;
  });
}

export function nextActor(hand, from) {
  const n = hand.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    const p = hand.players[i];
    if (p.inHand && !p.folded && !p.allIn && !p.acted) return i;
  }
  return -1;
}

export function firstPostflopActor(hand) {
  const n = hand.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (hand.button + k) % n;
    const p = hand.players[i];
    if (p.inHand && !p.folded && !p.allIn) return i;
  }
  return -1;
}

function pay(p, chips) {
  const amount = Math.min(p.stack, chips);
  if (amount < 0) throw new Error('negative payment');
  p.stack -= amount;
  p.streetBet += amount;
  p.totalCommitted += amount;
  if (p.stack === 0) p.allIn = true;
  return amount;
}

function onAggressive(hand, seat, newStreetBet) {
  const previous = hand.currentBet;
  const inc = newStreetBet - previous;
  const opening = previous === 0;
  const full = opening || inc >= hand.minRaise;
  hand.currentBet = newStreetBet;
  if (full) {
    hand.minRaise = Math.max(inc, hand.bigBlind);
    for (let k = 0; k < hand.players.length; k++) {
      if (k === seat) continue;
      const p = hand.players[k];
      if (p.inHand && !p.folded && !p.allIn) {
        p.acted = false;
        p.raiseAllowed = true;
      }
    }
  } else {
    for (let k = 0; k < hand.players.length; k++) {
      if (k === seat) continue;
      const p = hand.players[k];
      if (!p.inHand || p.folded || p.allIn) continue;
      if (p.acted) p.raiseAllowed = false;
      if (p.streetBet < hand.currentBet) p.acted = false;
    }
  }
  hand.players[seat].acted = true;
}

/**
 * @param {object} hand
 * @param {number} seat
 * @param {'fold'|'check'|'call'|'bet'|'raise'} action
 * @param {number|null} desiredRaiseTo total street commitment for bet/raise
 */
export function applyAction(hand, seat, action, desiredRaiseTo) {
  const legal = legalActions(hand, seat);
  if (!legal.includes(action)) {
    throw new Error(`${action} is not legal facing ${toCall(hand, seat)} (legal: ${legal.join(', ') || 'none'})`);
  }
  const p = hand.players[seat];
  const state = {
    stack: p.stack,
    streetBet: p.streetBet,
    toCall: hand.currentBet - p.streetBet,
    currentBet: hand.currentBet,
    minRaise: hand.minRaise,
    bigBlind: hand.bigBlind,
  };
  const plan = planAmount(state, action, desiredRaiseTo);
  if (action === 'fold') {
    p.folded = true;
    p.acted = true;
    return { action, amount: 0, raiseTo: null, allIn: false };
  }
  if (action === 'check') {
    if (state.toCall > 0) throw new Error('cannot check facing a bet');
    p.acted = true;
    return { action, amount: 0, raiseTo: null, allIn: false };
  }
  if (action === 'call') {
    pay(p, plan.amount);
    p.acted = true;
    return { action, amount: plan.amount, raiseTo: p.streetBet, allIn: p.allIn };
  }
  if (action === 'bet' && hand.currentBet !== 0) throw new Error('cannot bet facing a bet');
  if (plan.amount <= 0) throw new Error('raise does not increase the bet');
  pay(p, plan.amount);
  onAggressive(hand, seat, p.streetBet);
  return { action, amount: plan.amount, raiseTo: p.streetBet, allIn: p.allIn };
}

export function resetStreetBets(hand) {
  hand.currentBet = 0;
  hand.minRaise = hand.bigBlind;
  for (const p of hand.players) {
    p.streetBet = 0;
    if (p.inHand && !p.folded && !p.allIn) {
      p.acted = false;
      p.raiseAllowed = true;
    }
  }
}
