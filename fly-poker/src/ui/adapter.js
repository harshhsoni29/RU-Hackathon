/**
 * Loads the real table API. If that module cannot be imported, a tiny stub
 * keeps the room and panels on screen. The stub does not play poker.
 */

const FLIES = [
  { id: 'vera', name: 'Vera', style: 'tight-aggressive', accessory: 'top-hat', color: 0x1f7a4d },
  { id: 'buzz', name: 'Buzz', style: 'loose-aggressive', accessory: 'scarf', color: 0xd4892a },
  { id: 'nib', name: 'Nib', style: 'tight-passive', accessory: 'monocle', color: 0x3d5a80 },
  { id: 'callie', name: 'Callie', style: 'loose-passive', accessory: 'bow', color: 0xd4537e },
  { id: 'mani', name: 'Mani', style: 'maniac', accessory: 'crown', color: 0xc23b22 },
  { id: 'soni', name: 'Soni', style: 'copycat', accessory: 'sunglasses', color: 0x7b5cd6 },
];

const NODES = [
  { id: 's0', layer: 'sensory', x: 0, y: 0, label: 'Hand strength' },
  { id: 's1', layer: 'sensory', x: 0, y: 1, label: 'Pot odds' },
  { id: 'k0', layer: 'kenyon', x: 1, y: 0, label: 'Kenyon 0' },
  { id: 'c0', layer: 'central', x: 2, y: 0, label: 'Central 0' },
  { id: 'm0', layer: 'motor', x: 3, y: 0, label: 'fold' },
  { id: 'm1', layer: 'motor', x: 3, y: 1, label: 'call' },
];

export async function loadEngine() {
  try {
    const mod = await import('../contract.js');
    const need = ['createTable', 'dealHand', 'step', 'getPublicState', 'getFlyInspection'];
    const missing = need.filter((name) => typeof mod[name] !== 'function');
    if (missing.length || !mod.FLIES) throw new Error(`contract.js missing ${missing.join(', ') || 'FLIES'}`);
    return {
      FLIES: mod.FLIES,
      DEALER: mod.DEALER,
      createTable: mod.createTable,
      dealHand: mod.dealHand,
      step: mod.step,
      getPublicState: mod.getPublicState,
      getFlyInspection: mod.getFlyInspection,
      source: 'contract',
    };
  } catch (error) {
    console.warn('contract.js unavailable, using a preview stub', error);
    return stubEngine();
  }
}

function stubEngine() {
  const table = blank();
  return {
    FLIES,
    DEALER: { id: 'chip', name: 'Chip', kind: 'beetle' },
    createTable() {
      return blank();
    },
    dealHand(live) {
      Object.assign(live, dealt());
      return live;
    },
    step(live) {
      if (live.phase !== 'betting') return null;
      const names = ['vera', 'buzz', 'nib', 'callie', 'mani'];
      const actor = names[live.cursor % names.length];
      live.cursor += 1;
      const action = live.cursor % 5 === 0 ? 'fold' : live.cursor % 2 === 0 ? 'call' : 'check';
      live.lastActions.push({
        handNumber: live.handNumber,
        street: live.street,
        flyId: actor,
        action,
        amount: action === 'call' ? 10 : 0,
        raiseTo: null,
        allIn: false,
      });
      live.actorId = names[live.cursor % names.length];
      if (live.cursor === 3) {
        live.street = 'flop';
        live.board = cards(['Ah', 'Kd', '7c']);
      }
      if (live.cursor >= 6) {
        live.phase = 'between';
        live.handLive = false;
        live.canDeal = true;
        live.actorId = null;
        live.pot = 0;
        const fly = live.seats.find((s) => s.id === 'vera');
        fly.stack += 20;
        fly.stats.handsPlayed += 1;
        fly.stats.handsWon += 1;
        live.learning = {
          handNumber: live.handNumber,
          chipsDelta: 20,
          reward: 0.2,
          summary: 'Preview only — no poker rules are running.',
          deltas: [
            { parameter: 'aggression', before: 1, after: 1.05, delta: 0.05, why: 'Stub delta so the panel can show a numeric change.' },
          ],
        };
        return { handEnded: true, flyId: actor, action };
      }
      return { handEnded: false, flyId: actor, action };
    },
    getPublicState(live) {
      return publicState(live);
    },
    getFlyInspection(live, flyId) {
      const fly = FLIES.find((item) => item.id === flyId);
      if (!fly) throw new Error(`unknown fly ${flyId}`);
      const learned = live.learning;
      return {
        id: fly.id,
        name: fly.name,
        style: fly.style,
        accessory: fly.accessory,
        color: fly.color,
        colorHex: `#${fly.color.toString(16).padStart(6, '0')}`,
        playstyle: {
          label: fly.style,
          summary: 'Preview profile. The live engine is not loaded, so this is not a poker decision.',
          vpip: 0.2,
          pfr: 0.1,
          aggression: 1,
          bluff: 0.1,
          foldToPressure: 0.5,
          learnRate: 0.05,
        },
        decision: live.phase === 'betting' ? {
          live: live.actorId === fly.id,
          action: 'check',
          amount: 0,
          allIn: false,
          street: live.street,
          handName: 'preview',
          reasons: ['Stub room only.', 'No cards were evaluated.'],
        } : null,
        nodes: NODES,
        activity: NODES.map((_, i) => (live.actorId === fly.id ? 0.2 + (i % 3) * 0.3 : 0.05)),
        edges: [
          { from: 's0', to: 'k0', sign: 1, gain: 1 },
          { from: 's1', to: 'k0', sign: 1, gain: 0.6 },
          { from: 'k0', to: 'c0', sign: 1, gain: 0.8 },
          { from: 'c0', to: 'm0', sign: -1, gain: 0.4 },
          { from: 'c0', to: 'm1', sign: 1, gain: 1.1 },
        ],
        learning: { last: learned, recent: learned ? [learned] : [] },
        circuit: { description: 'Preview graph. Not the live fly circuit.' },
      };
    },
    source: 'stub',
  };

  function blank() {
    return {
      phase: 'between',
      handNumber: 0,
      cursor: 0,
      street: null,
      board: [],
      pot: 0,
      actorId: null,
      lastActions: [],
      learning: null,
      seats: FLIES.map((fly) => ({
        ...fly,
        stack: 1000,
        bet: 0,
        holeCards: [],
        folded: false,
        sittingOut: false,
        isActor: false,
        isButton: false,
        isSmallBlind: false,
        isBigBlind: false,
        stats: { handsPlayed: 0, handsWon: 0 },
      })),
    };
  }

  function dealt() {
    const holes = {
      vera: ['As', 'Kd'],
      buzz: ['Qh', 'Js'],
      nib: ['7c', '2d'],
      callie: ['9h', '8h'],
      mani: ['Ac', '5c'],
    };
    return {
      phase: 'betting',
      handNumber: 1,
      cursor: 0,
      street: 'preflop',
      board: [],
      pot: 15,
      actorId: 'vera',
      learning: null,
      seats: FLIES.map((fly, i) => ({
        ...fly,
        stack: 1000 - (i === 0 ? 5 : i === 1 ? 10 : 0),
        bet: i === 0 ? 5 : i === 1 ? 10 : 0,
        holeCards: cards(holes[fly.id]),
        folded: false,
        sittingOut: false,
        isActor: fly.id === 'vera',
        isButton: fly.id === 'mani',
        isSmallBlind: fly.id === 'vera',
        isBigBlind: fly.id === 'buzz',
        stats: { handsPlayed: 0, handsWon: 0 },
      })),
    };
  }

  function publicState(live) {
    return {
      phase: live.phase,
      spectator: true,
      spectatorNote: 'Preview stub. All hole cards are visible.',
      handNumber: live.handNumber,
      handLive: live.phase === 'betting',
      canDeal: live.phase !== 'betting',
      street: live.street,
      board: live.board,
      pot: live.pot,
      blinds: { small: 5, big: 10 },
      actorId: live.actorId,
      seats: live.seats.map((seat) => ({ ...seat, isActor: seat.id === live.actorId })),
      lastActions: live.lastActions,
      lastSettlement: null,
      dealer: { id: 'chip', name: 'Chip', kind: 'beetle' },
    };
  }
}

function cards(codes) {
  return codes.map((code) => ({ rank: code[0], suit: code[1], code }));
}
