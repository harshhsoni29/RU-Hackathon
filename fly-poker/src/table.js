/** Hold'em table. Mutates the table object passed in by dealHand and step. */

import { makeDeck, shuffle, toCards } from './poker/cards.js';
import { makeRng } from './poker/rng.js';
import { legalActions, applyAction, roundComplete, nextActor, firstPostflopActor, resetStreetBets } from './poker/betting.js';
import { settlePots } from './poker/pots.js';
import { decide } from './brains/policy.js';
import { learnFromHand } from './brains/learning.js';
import { copyBias, copyTarget, emptyMimic, followShares, learnMimic, pickMentor } from './brains/mimic.js';
import { createBrain, NODES, CIRCUIT_META } from './brains/circuit.js';
import {
  FLIES,
  DEALER,
  STYLE_META,
  resolveStyles,
  emptyModel,
  smoothedRates,
  colorHex,
} from './brains/styles.js';

const NEXT_STREET = { preflop: 'flop', flop: 'turn', turn: 'river' };
const STREET_CARDS = { flop: 3, turn: 1, river: 1 };

function emptyStats() {
  return {
    handsPlayed: 0,
    handsWon: 0,
    vpipHands: 0,
    pfrHands: 0,
    betsRaises: 0,
    calls: 0,
    folds: 0,
    checks: 0,
    netChips: 0,
  };
}

function nextIndex(from, length, pred) {
  for (let k = 1; k <= length; k++) {
    const i = (from + k) % length;
    if (pred(i)) return i;
  }
  return -1;
}

function potOf(hand) {
  let pot = 0;
  for (const p of hand.players) pot += p.totalCommitted;
  return pot;
}

function chipSum(table) {
  if (table.hand && table.phase === 'betting') {
    let sum = 0;
    for (const p of table.hand.players) sum += p.stack + p.totalCommitted;
    return sum;
  }
  let sum = 0;
  for (const fly of table.flies) sum += fly.stack;
  return sum;
}

function assertChips(table) {
  const sum = chipSum(table);
  if (sum !== table.chipConstant) throw new Error(`chip total ${sum} != ${table.chipConstant}`);
}

function mirror(table) {
  if (!table.hand) return;
  for (let i = 0; i < table.flies.length; i++) table.flies[i].stack = table.hand.players[i].stack;
}

function postBlind(player, amount) {
  const pay = Math.min(player.stack, amount);
  player.stack -= pay;
  player.streetBet += pay;
  player.totalCommitted += pay;
  if (player.stack === 0) player.allIn = true;
}

function dealStreet(hand, street) {
  const n = STREET_CARDS[street];
  for (let i = 0; i < n; i++) hand.board.push(hand.deck.pop());
  hand.street = street;
}

function inPosition(hand, seat) {
  const n = hand.players.length;
  for (let k = 0; k < n; k++) {
    const i = (hand.button - k + n) % n;
    const p = hand.players[i];
    if (p.inHand && !p.folded && !p.allIn) return i === seat;
  }
  return false;
}

function buildContext(table, seat, legal) {
  const hand = table.hand;
  const player = hand.players[seat];
  const fly = table.flies[seat];
  const pot = potOf(hand);
  const toCall = Math.max(0, hand.currentBet - player.streetBet);
  const liveOthers = hand.players.filter((p) => p.inHand && !p.folded && p.seat !== seat);
  const pool = liveOthers.length ? liveOthers : hand.players.filter((p) => p.seat !== seat && p.inHand);
  let oppAggression = 0;
  let oppVpip = 0;
  for (const other of pool) {
    const rates = smoothedRates(fly.model[other.id], table.flies[other.seat].base);
    oppAggression += rates.aggression;
    oppVpip += rates.vpip;
  }
  oppAggression /= pool.length;
  oppVpip /= pool.length;
  let facingName = null;
  if (toCall > 0 && hand.lastAggressor != null && hand.lastAggressor !== seat) {
    const aggressor = hand.players[hand.lastAggressor];
    const rates = smoothedRates(fly.model[aggressor.id], table.flies[aggressor.seat].base);
    oppAggression = rates.aggression * 0.7 + oppAggression * 0.3;
    facingName = table.flies[aggressor.seat].name;
  }
  const limpers = hand.street === 'preflop'
    ? hand.log.filter((ev) => ev.street === 'preflop' && ev.action === 'call').length
    : 0;
  const raisesThisStreet = hand.log.filter((ev) => (
    ev.street === hand.street && (ev.action === 'raise' || ev.action === 'bet')
  )).length;
  return {
    brain: fly.brain,
    style: fly.style,
    params: fly.params,
    hole: player.hole,
    board: hand.board,
    street: hand.street,
    pot,
    toCall,
    currentBet: hand.currentBet,
    minRaise: hand.minRaise,
    bigBlind: hand.bigBlind,
    stack: player.stack,
    streetBet: player.streetBet,
    legal,
    inPosition: inPosition(hand, seat),
    opponents: Math.max(1, liveOthers.length),
    oppAggression,
    oppVpip,
    invested: player.totalCommitted / Math.max(pot, 1),
    limpers,
    raisesThisStreet,
    facingName,
  };
}

/** A copycat plays with the style of the fly it follows this hand and leans toward that fly's last move. */
function followContext(table, fly, ctx) {
  const mentor = fly.mimic && table.flies.find((other) => other.id === fly.mimic.mentor);
  if (!mentor) return ctx;
  const target = copyTarget(table.hand.log, mentor.id, table.hand.street, ctx.legal);
  return {
    ...ctx,
    style: mentor.style,
    params: mentor.params,
    bias: copyBias(fly.mimic, target),
    copyTarget: target,
    biasNote: target
      ? `Copying ${mentor.name}'s ${target.seen} (copy strength ${fly.mimic.copy.toFixed(2)})`
      : `Following ${mentor.name}'s style; ${mentor.name} has not acted yet`,
  };
}

function publicDecision(decision) {
  return {
    live: false,
    action: decision.action,
    amount: decision.amount,
    raiseTo: decision.raiseTo,
    allIn: decision.allIn,
    street: decision.street,
    handCategory: decision.handCategory,
    handName: decision.handName,
    equityEstimate: decision.equityEstimate,
    potOdds: decision.potOdds,
    toCall: decision.toCall,
    pot: decision.pot,
    logits: { ...decision.logits },
    reasons: decision.reasons.slice(),
    legal: decision.legal.slice(),
    handPercentile: decision.handPercentile,
  };
}

function publicStats(fly) {
  const hands = fly.stats.handsPlayed;
  return {
    handsPlayed: hands,
    handsWon: fly.stats.handsWon,
    winRate: hands ? fly.stats.handsWon / hands : 0,
    vpip: hands ? fly.stats.vpipHands / hands : 0,
    pfr: hands ? fly.stats.pfrHands / hands : 0,
    aggressionFactor: fly.stats.calls ? fly.stats.betsRaises / fly.stats.calls : fly.stats.betsRaises,
    betsRaises: fly.stats.betsRaises,
    calls: fly.stats.calls,
    folds: fly.stats.folds || 0,
    checks: fly.stats.checks || 0,
    netChips: fly.stats.netChips,
  };
}

export function createTable(config = {}) {
  const seed = config.seed == null ? 1 : config.seed >>> 0;
  const smallBlind = config.smallBlind == null ? 5 : Math.round(config.smallBlind);
  const bigBlind = config.bigBlind == null ? 10 : Math.round(config.bigBlind);
  const startingStack = config.startingStack == null ? 1000 : Math.round(config.startingStack);
  if (!(smallBlind > 0) || !(bigBlind > smallBlind)) throw new Error('blinds must satisfy 0 < small blind < big blind');
  if (startingStack < bigBlind) throw new Error('starting stack must cover the big blind');
  const loaded = resolveStyles(config.styles);
  const flies = FLIES.map((meta, seat) => {
    const brain = createBrain();
    return {
    id: meta.id,
    name: meta.name,
    style: meta.style,
    accessory: meta.accessory,
    color: meta.color,
    seat,
    stack: startingStack,
    base: loaded.styles[meta.id],
    params: { ...loaded.styles[meta.id] },
    brain,
    frozenBrain: { edges: brain.edges.map((edge) => ({ ...edge })) },
    frozenParams: { ...loaded.styles[meta.id] },
    policyCompare: {
      decisions: 0,
      disagreements: 0,
      lastLive: null,
      lastFrozen: null,
      since: null,
    },
    model: Object.fromEntries(FLIES.filter((other) => other.id !== meta.id).map((other) => [other.id, emptyModel()])),
    mimic: meta.style === 'copycat' ? emptyMimic(FLIES.filter((other) => other.id !== meta.id).map((other) => other.id)) : null,
    stats: emptyStats(),
    lastDecision: null,
    lastActivity: null,
    learningLog: [],
    profileHistory: [],
    pending: [],
    };
  });
  return {
    seed,
    rng: makeRng(seed),
    smallBlind,
    bigBlind,
    startingStack,
    chipConstant: startingStack * FLIES.length,
    button: -1,
    handNumber: 0,
    phase: 'between',
    hand: null,
    flies,
    lastActions: [],
    handHistory: [],
    lastSettlement: null,
    showcase: null,
    message: null,
    stylesSource: loaded.source,
    stylesWarning: loaded.warning,
  };
}

export function dealHand(table) {
  if (table.phase === 'betting') throw new Error('Hand already in progress');
  const solvent = [];
  for (let i = 0; i < table.flies.length; i++) if (table.flies[i].stack > 0) solvent.push(i);
  if (solvent.length < 2) {
    table.message = 'Not enough chips to deal';
    return table;
  }
  const button = nextIndex(table.button, table.flies.length, (i) => table.flies[i].stack > 0);
  const players = table.flies.map((fly) => ({
    id: fly.id,
    seat: fly.seat,
    stack: fly.stack,
    hole: [],
    folded: false,
    allIn: false,
    inHand: fly.stack > 0,
    streetBet: 0,
    totalCommitted: 0,
    acted: false,
    raiseAllowed: true,
    handStartStack: fly.stack,
  }));
  const seated = players.filter((p) => p.inHand).length;
  const sb = seated === 2 ? button : nextIndex(button, players.length, (i) => players[i].inHand);
  const bb = nextIndex(sb, players.length, (i) => players[i].inHand);
  postBlind(players[sb], table.smallBlind);
  postBlind(players[bb], table.bigBlind);
  const deck = shuffle(makeDeck(), () => table.rng.next());
  const order = [];
  for (let k = 1; k <= players.length; k++) {
    const i = (button + k) % players.length;
    if (players[i].inHand) order.push(i);
  }
  for (let round = 0; round < 2; round++) {
    for (const i of order) players[i].hole.push(deck.pop());
  }
  for (const fly of table.flies) {
    fly.pending = [];
    if (!fly.mimic) continue;
    const candidates = players.filter((p) => p.inHand && p.id !== fly.id).map((p) => p.id);
    fly.mimic.mentor = pickMentor(fly.mimic, candidates, () => table.rng.next());
    fly.mimic.copied = 0;
    fly.mimic.decisions = 0;
  }
  table.handNumber += 1;
  table.button = button;
  table.phase = 'betting';
  table.message = null;
  table.hand = {
    players,
    deck,
    board: [],
    button,
    sb,
    bb,
    street: 'preflop',
    currentBet: Math.max(players[sb].streetBet, players[bb].streetBet),
    minRaise: table.bigBlind,
    bigBlind: table.bigBlind,
    smallBlind: table.smallBlind,
    actor: nextIndex(bb, players.length, (i) => players[i].inHand && !players[i].allIn && !players[i].folded),
    lastAggressor: null,
    log: [],
    actionCount: 0,
  };
  mirror(table);
  assertChips(table);
  if (table.hand.actor < 0) {
    const showdown = players.filter((p) => p.inHand && !p.folded).length > 1;
    finishHand(table, blankResult(table), showdown);
  }
  return table;
}

function learnToFollow(table, fly, record, names) {
  const results = {};
  for (const p of table.hand.players) {
    if (p.inHand && p.id !== fly.id) results[p.id] = Math.tanh((p.stack - p.handStartStack) / (8 * table.bigBlind));
  }
  const { mimic } = fly;
  const deltas = learnMimic(mimic, {
    reward: record.reward,
    results,
    copiedShare: mimic.decisions ? mimic.copied / mimic.decisions : 0,
    names,
  });
  record.deltas.unshift(...deltas);
  const shares = followShares(mimic);
  const [top] = Object.entries(shares).sort((a, b) => b[1] - a[1]);
  record.summary = `Followed ${names[mimic.mentor]} · now leans toward ${names[top[0]]} (${Math.round(top[1] * 100)}%), copy strength ${mimic.copy.toFixed(2)}`;
}

function mimicView(table, fly) {
  if (!fly.mimic) return null;
  const names = Object.fromEntries(table.flies.map((other) => [other.id, other.name]));
  const shares = followShares(fly.mimic);
  return {
    mentor: fly.mimic.mentor,
    mentorName: names[fly.mimic.mentor] || null,
    copyStrength: fly.mimic.copy,
    follow: Object.entries(shares)
      .map(([id, share]) => ({ id, name: names[id], share }))
      .sort((a, b) => b.share - a.share),
  };
}

function notePolicyMove(fly, record, handNumber) {
  if (!fly.policyCompare || fly.policyCompare.since || !record) return;
  const moved = (record.deltas || []).some((row) => {
    const parameter = String(row.parameter || '');
    return parameter.startsWith('gain:') || parameter === 'aggression' || parameter === 'bluff' || parameter === 'foldToPressure';
  });
  if (!moved) return;
  fly.policyCompare.since = {
    handNumber,
    netChips: fly.stats.netChips,
    handsPlayed: fly.stats.handsPlayed,
    handsWon: fly.stats.handsWon,
  };
}

function blankResult(table) {
  return {
    handNumber: table.handNumber,
    street: table.hand.street,
    flyId: null,
    action: null,
    amount: 0,
    raiseTo: null,
    allIn: false,
    pot: potOf(table.hand),
    handEnded: false,
    winners: null,
    learningApplied: false,
    decisionSummary: null,
  };
}

export function step(table) {
  if (!table.hand || table.phase !== 'betting') return null;
  const hand = table.hand;
  hand.actionCount += 1;
  if (hand.actionCount > 240) throw new Error('hand exceeded the action cap');
  const seat = hand.actor;
  if (seat < 0) throw new Error('no player to act');
  const legal = legalActions(hand, seat);
  if (legal.length === 0) throw new Error('actor has no legal action');
  const fly = table.flies[seat];
  const ctx = followContext(table, fly, buildContext(table, seat, legal));
  const decision = decide(ctx);
  const applied = applyAction(hand, seat, decision.action, decision.raiseTo);
  if (ctx.copyTarget) {
    fly.mimic.decisions += 1;
    if (applied.action === ctx.copyTarget.action) fly.mimic.copied += 1;
  }
  fly.pending.push({
    drive: decision.drive,
    chosen: ['fold', 'check', 'call', 'bet', 'raise'].indexOf(applied.action),
    bluff: (applied.action === 'bet' || applied.action === 'raise') && decision.equityEstimate < 0.45,
  });
  const shown = publicDecision(decision);
  shown.action = applied.action;
  shown.amount = applied.amount;
  shown.raiseTo = applied.raiseTo;
  shown.allIn = applied.allIn;
  fly.lastDecision = shown;
  fly.lastActivity = decision.activity.slice();
  const frozen = decide({ ...ctx, brain: fly.frozenBrain, params: fly.mimic ? ctx.params : fly.frozenParams });
  fly.policyCompare.decisions += 1;
  if (frozen.action !== applied.action) fly.policyCompare.disagreements += 1;
  fly.policyCompare.lastLive = applied.action;
  fly.policyCompare.lastFrozen = frozen.action;
  if (applied.action === 'bet' || applied.action === 'raise') hand.lastAggressor = seat;
  const event = {
    seq: hand.log.length,
    seat,
    id: fly.id,
    flyId: fly.id,
    action: applied.action,
    amount: applied.amount,
    raiseTo: applied.raiseTo,
    street: hand.street,
    allIn: applied.allIn,
    handNumber: table.handNumber,
  };
  hand.log.push(event);
  table.lastActions.push(event);
  if (table.lastActions.length > 100) table.lastActions.shift();
  mirror(table);
  assertChips(table);

  const result = {
    handNumber: table.handNumber,
    street: event.street,
    flyId: fly.id,
    action: applied.action,
    amount: applied.amount,
    raiseTo: applied.raiseTo,
    allIn: applied.allIn,
    pot: potOf(hand),
    handEnded: false,
    winners: null,
    learningApplied: false,
    decisionSummary: decision.reasons[decision.reasons.length - 1] || applied.action,
  };

  const live = hand.players.filter((p) => p.inHand && !p.folded);
  if (live.length <= 1) return finishHand(table, result, false);
  if (!roundComplete(hand)) {
    const nxt = nextActor(hand, seat);
    if (nxt < 0) throw new Error('betting round has no next actor');
    hand.actor = nxt;
    return result;
  }
  const canBet = live.filter((p) => !p.allIn && p.stack > 0);
  if (canBet.length <= 1 || hand.street === 'river') return finishHand(table, result, live.length > 1);
  dealStreet(hand, NEXT_STREET[hand.street]);
  resetStreetBets(hand);
  hand.actor = firstPostflopActor(hand);
  if (hand.actor < 0) return finishHand(table, result, true);
  return result;
}

function finishHand(table, result, showdown) {
  const hand = table.hand;
  if (showdown) {
    while (hand.street !== 'river') dealStreet(hand, NEXT_STREET[hand.street]);
    if (hand.board.length !== 5) throw new Error(`runout dealt ${hand.board.length} cards`);
  }
  const committed = new Map(hand.players.map((p) => [p.id, p.totalCommitted]));
  const settlement = settlePots(hand.players, hand.button, hand.board, showdown);
  const paid = new Map(settlement.payments.map((p) => [p.id, p.amount]));
  for (const p of hand.players) {
    p.stack += paid.get(p.id) || 0;
    p.totalCommitted = 0;
    p.streetBet = 0;
  }
  mirror(table);
  assertChips(table);

  const names = Object.fromEntries(table.flies.map((fly) => [fly.id, fly.name]));
  const priors = Object.fromEntries(table.flies.map((fly) => [fly.id, fly.base]));
  for (let i = 0; i < hand.players.length; i++) {
    const player = hand.players[i];
    const fly = table.flies[i];
    if (!player.inHand) {
      fly.pending = [];
      continue;
    }
    const chipsDelta = player.stack - player.handStartStack;
    const foldEvent = hand.log.find((ev) => ev.seat === i && ev.action === 'fold');
    const foldSeq = foldEvent ? foldEvent.seq : Infinity;
    const visible = hand.log.filter((ev) => ev.seq <= foldSeq);
    const learned = learnFromHand(fly, {
      chipsDelta,
      bb: table.bigBlind,
      events: visible,
      priorsById: priors,
      handNumber: table.handNumber,
      selfId: fly.id,
      names,
    });
    if (fly.mimic?.mentor) learnToFollow(table, fly, learned, names);
    fly.stats.handsPlayed += 1;
    fly.stats.netChips += chipsDelta;
    if ((paid.get(fly.id) || 0) > (committed.get(fly.id) || 0)) fly.stats.handsWon += 1;
    let vpip = false;
    let pfr = false;
    for (const ev of visible) {
      if (ev.seat !== i) continue;
      if (ev.action === 'bet' || ev.action === 'raise') fly.stats.betsRaises += 1;
      if (ev.action === 'call') fly.stats.calls += 1;
      if (ev.action === 'fold') fly.stats.folds += 1;
      if (ev.action === 'check') fly.stats.checks += 1;
      if (ev.street === 'preflop' && (ev.action === 'call' || ev.action === 'bet' || ev.action === 'raise')) vpip = true;
      if (ev.street === 'preflop' && (ev.action === 'bet' || ev.action === 'raise')) pfr = true;
    }
    if (vpip) fly.stats.vpipHands += 1;
    if (pfr) fly.stats.pfrHands += 1;
    rememberProfile(table, fly, table.handNumber);
    notePolicyMove(fly, learned, table.handNumber);
  }

  const winners = [];
  const winnerAmounts = new Map();
  for (const pot of settlement.pots) {
    for (const winner of pot.winners) {
      const row = winnerAmounts.get(winner.id) || {
        id: winner.id,
        name: names[winner.id],
        amount: 0,
        handName: winner.handName,
        category: winner.category,
      };
      row.amount += winner.amount;
      if (winner.handName) row.handName = winner.handName;
      winnerAmounts.set(winner.id, row);
    }
  }
  for (const row of winnerAmounts.values()) winners.push(row);

  table.lastSettlement = {
    handNumber: table.handNumber,
    showdown,
    board: toCards(hand.board),
    winners,
    showed: settlement.showed.map((row) => ({
      id: row.id,
      name: names[row.id],
      holeCards: toCards(hand.players.find((p) => p.id === row.id).hole),
      handName: row.handName,
      category: row.category,
      score: row.score,
      wonAmount: paid.get(row.id) || 0,
    })),
  };
  table.handHistory.push({
    handNumber: table.handNumber,
    board: toCards(hand.board),
    winners: winners.map((w) => ({ id: w.id, amount: w.amount, handName: w.handName })),
    nets: hand.players.filter((p) => p.inHand).map((p) => ({ id: p.id, delta: p.stack - p.handStartStack })),
  });
  if (table.handHistory.length > 30) table.handHistory.shift();
  table.showcase = {
    board: hand.board.slice(),
    holes: hand.players.map((p) => p.hole.slice()),
    folded: hand.players.map((p) => p.folded),
    allIn: hand.players.map((p) => p.allIn),
    sittingOut: hand.players.map((p) => !p.inHand),
    button: hand.button,
    sb: hand.sb,
    bb: hand.bb,
    street: hand.street,
  };
  table.phase = 'between';
  table.hand = null;
  result.handEnded = true;
  result.winners = winners;
  result.learningApplied = true;
  return result;
}

export function getPublicState(table) {
  const hand = table.phase === 'betting' ? table.hand : null;
  const show = table.showcase;
  const button = hand ? hand.button : show ? show.button : null;
  const sb = hand ? hand.sb : show ? show.sb : null;
  const bb = hand ? hand.bb : show ? show.bb : null;
  const seats = table.flies.map((fly, i) => {
    const player = hand ? hand.players[i] : null;
    const holeIds = player ? player.hole : show ? show.holes[i] : [];
    return {
      id: fly.id,
      name: fly.name,
      style: fly.style,
      accessory: fly.accessory,
      color: fly.color,
      colorHex: colorHex(fly.color),
      seat: i,
      stack: player ? player.stack : fly.stack,
      bet: player ? player.streetBet : 0,
      toCall: player ? Math.max(0, hand.currentBet - player.streetBet) : 0,
      committed: player ? player.totalCommitted : 0,
      holeCards: toCards(holeIds),
      folded: player ? player.folded : show ? show.folded[i] : false,
      allIn: player ? player.allIn : show ? show.allIn[i] : false,
      sittingOut: player ? !player.inHand : show ? show.sittingOut[i] : fly.stack <= 0,
      isButton: button === i,
      isSmallBlind: sb === i,
      isBigBlind: bb === i,
      isActor: hand ? hand.actor === i : false,
      stats: publicStats(fly),
      following: fly.mimic && hand ? table.flies.find((other) => other.id === fly.mimic.mentor)?.name || null : null,
    };
  });
  let leader = table.flies[0];
  for (const fly of table.flies) if (fly.stack > leader.stack) leader = fly;
  const solvent = table.flies.filter((fly) => fly.stack > 0).length;
  return {
    phase: table.phase,
    spectator: true,
    spectatorNote: 'All hole cards are visible (spectator view).',
    handNumber: table.handNumber,
    handLive: table.phase === 'betting',
    canDeal: table.phase === 'between' && solvent >= 2,
    street: hand ? hand.street : show ? show.street : null,
    board: toCards(hand ? hand.board : show ? show.board : []),
    pot: hand ? potOf(hand) : 0,
    currentBet: hand ? hand.currentBet : 0,
    minRaise: hand ? hand.minRaise : table.bigBlind,
    blinds: { small: table.smallBlind, big: table.bigBlind },
    buttonId: button == null ? null : table.flies[button].id,
    smallBlindId: sb == null ? null : table.flies[sb].id,
    bigBlindId: bb == null ? null : table.flies[bb].id,
    actorId: hand && hand.actor >= 0 ? table.flies[hand.actor].id : null,
    seats,
    lastActions: table.lastActions.map((ev) => ({
      handNumber: ev.handNumber,
      street: ev.street,
      flyId: ev.flyId,
      action: ev.action,
      amount: ev.amount,
      raiseTo: ev.raiseTo,
      allIn: ev.allIn,
    })),
    handHistory: table.handHistory,
    lastSettlement: table.lastSettlement,
    chipLeader: {
      id: leader.id,
      name: leader.name,
      stack: leader.stack,
      netChips: leader.stats.netChips,
      winRate: leader.stats.handsPlayed ? leader.stats.handsWon / leader.stats.handsPlayed : 0,
    },
    dealer: { id: DEALER.id, name: DEALER.name, kind: DEALER.kind },
    startingStack: table.startingStack,
    seed: table.seed,
    stylesSource: table.stylesSource,
    message: table.message,
  };
}

function situationOf(table, fly, decision) {
  const player = table.hand?.players?.[fly.seat];
  return {
    street: table.hand?.street || decision?.street || null,
    hole: player ? toCards(player.hole) : [],
    board: table.hand ? toCards(table.hand.board) : [],
    legal: Array.isArray(decision?.legal) ? decision.legal.slice() : [],
    executed: decision?.action || null,
    logits: decision?.logits ? { ...decision.logits } : null,
  };
}

function compareOf(fly) {
  const compare = fly.policyCompare || {};
  const since = compare.since;
  return {
    decisions: compare.decisions || 0,
    disagreements: compare.disagreements || 0,
    lastLive: compare.lastLive || null,
    lastFrozen: compare.lastFrozen || null,
    moved: Boolean(since),
    sinceHand: since?.handNumber ?? null,
    handsSince: since ? fly.stats.handsPlayed - since.handsPlayed : 0,
    chipsSince: since ? fly.stats.netChips - since.netChips : 0,
    winsSince: since ? fly.stats.handsWon - since.handsWon : 0,
  };
}

function unit(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rememberProfile(table, fly, handNumber) {
  if (!Array.isArray(fly.profileHistory)) fly.profileHistory = [];
  const profile = strategyProfile(table, fly);
  fly.profileHistory.push({
    handNumber,
    values: profile.axes.map((axis) => axis.value),
  });
  if (fly.profileHistory.length > 40) fly.profileHistory.shift();
}

/** A copycat plays with the parameters of whoever it follows, so its own are a share-weighted blend. */
function playedParams(table, fly) {
  if (!fly.mimic) return fly.params;
  const shares = followShares(fly.mimic);
  const blend = { vpip: 0, pfr: 0, aggression: 0, bluff: 0, foldToPressure: 0, learnRate: fly.params.learnRate };
  for (const other of table.flies) {
    const share = shares[other.id] || 0;
    for (const key of ['vpip', 'pfr', 'aggression', 'bluff', 'foldToPressure']) blend[key] += share * other.params[key];
  }
  return blend;
}

/** Radar values from the live parameters, swapped to counted rates after 3 hands. */
function strategyProfile(table, fly) {
  const params = playedParams(table, fly);
  const hands = fly.stats.handsPlayed || 0;
  const folds = fly.stats.folds || 0;
  const checks = fly.stats.checks || 0;
  const actions = (fly.stats.betsRaises || 0) + (fly.stats.calls || 0) + folds + checks;
  const observed = hands >= 3 && actions > 0;
  const aggParam = params.aggression / (params.aggression + 1.5);
  const observedAgg = actions ? fly.stats.betsRaises / actions : aggParam;
  const observedRisk = hands ? fly.stats.vpipHands / hands : params.vpip;
  const observedFold = actions ? folds / actions : params.foldToPressure;
  return {
    hands,
    source: observed ? 'observed' : 'model',
    history: Array.isArray(fly.profileHistory) ? fly.profileHistory.map((row) => ({
      handNumber: row.handNumber,
      values: row.values.slice(),
    })) : [],
    note: observed
      ? 'Aggression, risk, and fold share use this fly’s action counts. Bluff frequency and response to bets stay on the learned parameters. A faded shape is an earlier hand, not a personality score.'
      : 'Fewer than 3 hands, so this is the model parameters. Fold willingness uses fold-to-pressure until folds have been counted.',
    axes: [
      {
        key: 'aggression',
        label: 'Aggression',
        value: unit(observed ? observedAgg : aggParam),
        detail: observed ? 'share of actions that bet or raised' : `parameter ${params.aggression.toFixed(2)}`,
      },
      {
        key: 'bluff',
        label: 'Bluff frequency',
        value: unit(params.bluff),
        detail: `learned bluff ${params.bluff.toFixed(2)}`,
      },
      {
        key: 'risk',
        label: 'Risk tolerance',
        value: unit(observed ? observedRisk : params.vpip),
        detail: observed ? 'observed preflop entry' : `VPIP parameter ${params.vpip.toFixed(2)}`,
      },
      {
        key: 'respond',
        label: 'Response to bets',
        value: unit(params.foldToPressure),
        detail: `fold-to-pressure ${params.foldToPressure.toFixed(2)}`,
      },
      {
        key: 'fold',
        label: 'Willingness to fold',
        value: unit(observed ? observedFold : params.foldToPressure),
        detail: observed ? 'share of actions that folded' : 'same fold-to-pressure parameter',
      },
      ...(fly.mimic ? [{
        key: 'copy',
        label: 'Copying',
        value: unit(fly.mimic.copy),
        detail: `copy strength ${fly.mimic.copy.toFixed(2)}; bluff and response to bets are blended from the flies it follows`,
      }] : []),
    ],
  };
}

export function getFlyInspection(table, flyId) {
  const fly = table.flies.find((item) => item.id === flyId);
  if (!fly) throw new Error(`unknown fly ${flyId}`);
  let decision = null;
  let activity = fly.lastActivity;
  if (table.phase === 'betting' && table.hand && table.hand.actor === fly.seat) {
    const legal = legalActions(table.hand, fly.seat);
    if (legal.length > 0) {
      const live = decide(followContext(table, fly, buildContext(table, fly.seat, legal)));
      decision = publicDecision(live);
      decision.live = true;
      activity = live.activity;
    }
  }
  if (!decision && fly.lastDecision) decision = { ...fly.lastDecision, live: false };
  if (!activity || activity.length !== NODES.length) activity = new Array(NODES.length).fill(0);
  const names = Object.fromEntries(table.flies.map((item) => [item.id, item.name]));
  const meta = STYLE_META[fly.style];
  return {
    id: fly.id,
    name: fly.name,
    style: fly.style,
    accessory: fly.accessory,
    color: fly.color,
    colorHex: colorHex(fly.color),
    playstyle: {
      key: fly.style,
      label: meta.label,
      summary: meta.summary,
      vpip: fly.params.vpip,
      pfr: fly.params.pfr,
      aggression: fly.params.aggression,
      bluff: fly.params.bluff,
      foldToPressure: fly.params.foldToPressure,
      learnRate: fly.params.learnRate,
      base: { ...fly.base },
      current: { ...fly.params },
    },
    profile: strategyProfile(table, fly),
    decision,
    nodes: NODES.map((node) => ({ id: node.id, layer: node.layer, x: node.x, y: node.y, label: node.label })),
    activity: activity.slice(),
    situation: situationOf(table, fly, decision),
    policyCompare: compareOf(fly),
    edges: fly.brain.edges.map((edge) => ({
      from: NODES[edge.from].id,
      to: NODES[edge.to].id,
      sign: edge.sign,
      gain: edge.gain,
    })),
    learning: {
      last: fly.learningLog[0] || null,
      recent: fly.learningLog.slice(),
    },
    opponentModel: Object.fromEntries(
      Object.keys(fly.model).map((id) => {
        const rates = smoothedRates(fly.model[id], table.flies.find((item) => item.id === id).base);
        return [id, { ...rates, name: names[id] }];
      }),
    ),
    circuit: { ...CIRCUIT_META },
    mimic: mimicView(table, fly),
  };
}
