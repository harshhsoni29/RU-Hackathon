/**
 * Chip travel for bets and pots.
 * Each fly keeps a clay stack on the felt in front of them. A bet, call, or
 * raise peels chips off that stack and slides them to the center of the felt,
 * where they stay as the pot. Check and fold move nothing. A won pot slides
 * back onto the winner's own stack. The next deal rebuilds stacks from the
 * public totals.
 */

import * as THREE from 'three';

const FELT_Y = 0.8;
const liveLayers = new Set();
const CHIP_R = 0.056;
const CHIP_H = 0.015;

const SPEND = new Set(['bet', 'call', 'raise']);

const bodyGeo = new THREE.CylinderGeometry(CHIP_R * 0.9, CHIP_R * 0.9, CHIP_H * 0.92, 28);
const bandGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H * 0.42, 28);
const spotGeo = new THREE.BoxGeometry(CHIP_R * 0.2, CHIP_H * 0.62, CHIP_R * 0.22);

const DENOM = [
  [0xc73a3a, 0xf6efe2],
  [0x2a5bd7, 0xf6efe2],
  [0x1f8a4a, 0xf7f3e8],
  [0x1a1816, 0xe6c15a],
  [0xf3ead2, 0xb4232c],
].map(([body, edge]) => ({
  body: new THREE.MeshStandardMaterial({ color: body, roughness: 0.46 }),
  edge: new THREE.MeshStandardMaterial({ color: edge, roughness: 0.4 }),
}));

const raf = globalThis.requestAnimationFrame
  ? (fn) => globalThis.requestAnimationFrame(fn)
  : (fn) => setTimeout(() => fn(performance.now()), 16);

function smooth(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function readVec(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return {
    x: value.x,
    y: Number.isFinite(value.y) ? value.y : 0,
    z: value.z,
  };
}

function seatRecord(layer, id) {
  const seats = layer.deps && layer.deps.seats;
  if (!Array.isArray(seats)) return null;
  for (let i = 0; i < seats.length; i++) {
    if (seats[i] && seats[i].id === id) return seats[i];
  }
  return null;
}

function boardAnchor(layer) {
  const fn = layer.deps && layer.deps.getBoardAnchor;
  const got = typeof fn === 'function' ? readVec(fn()) : null;
  if (got) return got;
  const passed = layer.deps && readVec(layer.deps.boardAnchor);
  return passed || { x: 0, y: FELT_Y, z: 0 };
}

function potAnchor(layer) {
  const fn = layer.deps && layer.deps.getPotAnchor;
  const got = typeof fn === 'function' ? readVec(fn()) : null;
  if (got) return got;
  const passed = layer.deps && readVec(layer.deps.potAnchor);
  if (passed) return passed;
  const board = boardAnchor(layer);
  return { x: board.x, y: board.y, z: board.z - 0.42 };
}

function feltRadii(layer) {
  const table = layer.deps && layer.deps.table;
  return {
    rx: (layer.deps && layer.deps.feltRx) || (table && table.feltRx) || 1.92,
    rz: (layer.deps && layer.deps.feltRz) || (table && table.feltRz) || 0.96,
  };
}

function flyAnchor(layer, id) {
  const fn = layer.deps && layer.deps.getFlyWorldPosition;
  const got = typeof fn === 'function' ? readVec(fn(id)) : null;
  if (got) return got;
  const seat = seatRecord(layer, id);
  const pos = seat && readVec(seat.position);
  if (pos && (Math.hypot(pos.x, pos.z) > 0.2)) return pos;
  const parked = seat && readVec(seat.cardAnchor);
  if (!parked) return null;
  const center = boardAnchor(layer);
  const dx = parked.x - center.x;
  const dz = parked.z - center.z;
  const len = Math.hypot(dx, dz) || 1;
  const { rx, rz } = feltRadii(layer);
  const ux = dx / len;
  const uz = dz / len;
  const feltDist = 1 / Math.hypot(ux / rx, uz / rz);
  return {
    x: center.x + ux * (feltDist + 0.55),
    y: parked.y,
    z: center.z + uz * (feltDist + 0.55),
  };
}

function inFrontOfFly(layer, flyId, slot) {
  const fly = flyAnchor(layer, flyId);
  const center = boardAnchor(layer);
  const seat = seatRecord(layer, flyId);
  const parked = seat && readVec(seat.cardAnchor);
  let dx = 0;
  let dz = 1;
  let len = 1;
  if (fly) {
    dx = fly.x - center.x;
    dz = fly.z - center.z;
    len = Math.hypot(dx, dz);
  }
  if (len < 1e-4 && parked) {
    dx = parked.x - center.x;
    dz = parked.z - center.z;
    len = Math.hypot(dx, dz);
  }
  if (len < 1e-4) {
    dx = 0;
    dz = 1;
    len = 1;
  }
  const ux = dx / len;
  const uz = dz / len;
  const { rx, rz } = feltRadii(layer);
  const feltDist = 1 / Math.hypot(ux / rx, uz / rz);
  // Close to the fly, on the cloth: just inside the felt edge, not the middle.
  const closeToFly = len - 0.38;
  const onCloth = feltDist - 0.1;
  const dist = Math.max(0.35, Math.min(closeToFly, onCloth));
  const side = (slot - 0.5) * 0.12;
  const board = boardAnchor(layer);
  return {
    x: center.x + ux * dist + (-uz) * side,
    y: board.y + 0.02,
    z: center.z + uz * dist + ux * side,
  };
}

/** Center of the felt. Later bets sit in a tight cluster around that point. */
function potChipPoint(layer, index) {
  const board = boardAnchor(layer);
  const angle = index * 0.95;
  const ring = index === 0 ? 0 : 0.07 + (index % 3) * 0.045;
  return {
    x: board.x + Math.cos(angle) * ring,
    y: board.y + 0.03,
    z: board.z + Math.sin(angle) * ring,
  };
}

function chipsForStack(amount) {
  if (amount == null || !Number.isFinite(amount)) return 6;
  if (amount <= 0) return 0;
  return Math.max(3, Math.min(12, Math.round(3 + amount / 150)));
}

function chipsForBet(amount) {
  const n = Math.round((amount > 0 ? amount : 20) / 40);
  return Math.max(2, Math.min(6, n));
}

function seatedIds(layer) {
  const seats = layer.deps && layer.deps.seats;
  if (Array.isArray(seats) && seats.length) {
    return seats.map((seat) => seat && seat.id).filter(Boolean);
  }
  return ['vera', 'buzz', 'nib', 'callie', 'mani'];
}

function colorFor(layer, flyId) {
  const index = seatedIds(layer).indexOf(flyId);
  return index < 0 ? 0 : index;
}

function makeChip(look, twist) {
  const chip = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, look.body);
  const band = new THREE.Mesh(bandGeo, look.edge);
  body.castShadow = true;
  body.receiveShadow = true;
  band.castShadow = true;
  chip.add(body, band);
  for (let s = 0; s < 8; s++) {
    const spot = new THREE.Mesh(spotGeo, s % 2 === 0 ? look.edge : look.body);
    const a = twist + (s / 8) * Math.PI * 2;
    spot.position.set(Math.cos(a) * CHIP_R * 0.9, 0, Math.sin(a) * CHIP_R * 0.9);
    spot.rotation.y = -a;
    spot.castShadow = true;
    chip.add(spot);
  }
  return chip;
}

function layoutChips(group) {
  const chips = group.children;
  for (let i = 0; i < chips.length; i++) {
    chips[i].position.set(0, CHIP_H * 0.5 + i * (CHIP_H + 0.003), 0);
    chips[i].rotation.set(0, i * 0.48, 0);
  }
}

function makeStack(count, colorIndex) {
  const group = new THREE.Group();
  const n = Math.max(1, count);
  for (let i = 0; i < n; i++) {
    const look = DENOM[(colorIndex + (i % 2)) % DENOM.length];
    group.add(makeChip(look, i * 0.2));
  }
  layoutChips(group);
  return group;
}

function ensureHome(layer, flyId) {
  const existing = layer.homes.get(flyId);
  if (existing && existing.parent) return existing;
  const home = new THREE.Group();
  home.name = `stack-${flyId}`;
  home.userData.kind = 'home';
  home.userData.flyId = flyId;
  const at = inFrontOfFly(layer, flyId, 0);
  home.position.set(at.x, at.y, at.z);
  layer.group.add(home);
  layer.homes.set(flyId, home);
  return home;
}

function setHomeCount(layer, flyId, count) {
  const home = ensureHome(layer, flyId);
  const colorIndex = colorFor(layer, flyId);
  while (home.children.length > count) home.remove(home.children[home.children.length - 1]);
  while (home.children.length < count) {
    const i = home.children.length;
    const look = DENOM[(colorIndex + (i % 2)) % DENOM.length];
    home.add(makeChip(look, i * 0.2));
  }
  layoutChips(home);
  return home;
}

function restoreHomes(layer) {
  const ids = new Set(seatedIds(layer));
  for (const id of layer.amounts.keys()) ids.add(id);
  for (const id of ids) {
    const amount = layer.amounts.has(id) ? layer.amounts.get(id) : null;
    setHomeCount(layer, id, chipsForStack(amount));
  }
}

function placePot(layer, count, index) {
  const pile = makeStack(count, index + 2);
  const at = potChipPoint(layer, index);
  pile.position.set(at.x, at.y, at.z);
  pile.userData.kind = 'pot';
  layer.group.add(pile);
  layer.pot.push(pile);
  return pile;
}

/** Lift chips off a fly's own stack. Spawns a pile only when that stack is empty. */
function takeBet(layer, flyId, amount, allIn, remain) {
  const home = ensureHome(layer, flyId);
  let want = chipsForBet(amount);
  if (allIn && home.children.length > 0) want = home.children.length;
  else if (Number.isFinite(remain)) {
    const leave = chipsForStack(remain);
    if (home.children.length <= leave) setHomeCount(layer, flyId, leave + want);
    want = Math.max(1, ensureHome(layer, flyId).children.length - leave);
  }
  const n = Math.min(want, home.children.length);
  if (n <= 0) {
    const born = makeStack(chipsForBet(amount), colorFor(layer, flyId));
    born.position.copy(home.position);
    born.userData.kind = 'pot';
    layer.group.add(born);
    return born;
  }
  const travel = new THREE.Group();
  travel.userData.kind = 'pot';
  const left = home.children.length - n;
  for (let i = 0; i < n; i++) travel.add(home.children[home.children.length - 1]);
  layoutChips(home);
  layoutChips(travel);
  travel.position.set(
    home.position.x,
    home.position.y + left * (CHIP_H + 0.003),
    home.position.z,
  );
  layer.group.add(travel);
  return travel;
}

function absorb(home, travel) {
  const chips = travel.children.slice();
  for (const chip of chips) home.add(chip);
  layoutChips(home);
  travel.removeFromParent();
}

function notedStack(action, flyId) {
  if (!action || !flyId) return null;
  if (Array.isArray(action.seats)) {
    for (const seat of action.seats) {
      if (seat && seat.id === flyId && Number.isFinite(seat.stack)) return seat.stack;
    }
  }
  if (action.stacks && Number.isFinite(action.stacks[flyId])) return action.stacks[flyId];
  if (action.flyId === flyId && Number.isFinite(action.stack)) return action.stack;
  return null;
}

function startPump(layer) {
  if (layer.pumping) return;
  layer.pumping = true;
  const step = (now) => {
    const jobs = layer.jobs;
    const finished = [];
    for (let i = jobs.length - 1; i >= 0; i--) {
      const job = jobs[i];
      const u = now < job.t0 ? 0 : Math.min(1, (now - job.t0) / job.duration);
      job.apply(u);
      if (now >= job.t0 + job.duration) {
        jobs.splice(i, 1);
        finished.push(job);
      }
    }
    for (const job of finished) job.done();
    if (jobs.length) layer.raf = raf(step);
    else layer.pumping = false;
  };
  layer.raf = raf(step);
}

function glide(layer, group, from, to, delay, duration) {
  return new Promise((resolve) => {
    let settled = false;
    const job = {
      t0: performance.now() + delay * 1000,
      duration: Math.max(16, duration * 1000),
      apply(u) {
        const t = smooth(u);
        const arc = Math.sin(Math.PI * t) * 0.28;
        group.position.set(
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t + arc,
          from.z + (to.z - from.z) * t,
        );
        group.rotation.y = t * 0.8;
      },
      done() {
        if (settled) return;
        settled = true;
        resolve();
      },
    };
    job.apply(0);
    layer.jobs.push(job);
    startPump(layer);
  });
}

function winnerRows(action) {
  if (Array.isArray(action.winners)) {
    return action.winners
      .map((row) => ({
        id: row && (row.id || row.flyId),
        amount: row && Number.isFinite(row.amount) ? row.amount : 0,
      }))
      .filter((row) => row.id && row.amount > 0);
  }
  if (action.wonBy == null) return [];
  const list = Array.isArray(action.wonBy) ? action.wonBy : [action.wonBy];
  const rows = [];
  for (const row of list) {
    if (typeof row === 'string') {
      rows.push({ id: row, amount: Number.isFinite(action.amount) && action.amount > 0 ? action.amount : 10 });
    } else if (row && (row.id || row.flyId)) {
      const amount = Number.isFinite(row.amount) ? row.amount : 10;
      if (amount > 0) rows.push({ id: row.id || row.flyId, amount });
    }
  }
  return rows;
}

function readAction(action) {
  if (!action || typeof action !== 'object') return null;
  const type = action.action || action.type || '';
  const flyId = action.flyId || null;
  const spends = SPEND.has(type) && !!flyId;
  const stated = Number.isFinite(action.amount) ? action.amount : null;
  const amount = stated != null && stated > 0 ? stated : 10;
  const winners = winnerRows(action);
  return {
    spend: spends ? { flyId, amount, allIn: !!action.allIn, remain: notedStack(action, flyId) } : null,
    winners,
  };
}

function wipe(layer) {
  layer.epoch += 1;
  const jobs = layer.jobs.splice(0, layer.jobs.length);
  for (const job of jobs) job.done();
  layer.group.clear();
  layer.bets.clear();
  layer.homes.clear();
  layer.pot = [];
  layer.won = [];
  restoreHomes(layer);
}

export function releaseHand(handNumber) {
  const key = handNumber == null ? null : handNumber;
  for (const layer of liveLayers) {
    if (layer.handNumber === key) continue;
    wipe(layer);
    layer.handNumber = key;
  }
}

function watchHand(layer, handNumber) {
  if (handNumber == null || layer.handNumber === handNumber) return;
  if (layer.handNumber == null) {
    layer.handNumber = handNumber;
    return;
  }
  wipe(layer);
  layer.handNumber = handNumber;
}

export function createChipLayer(scene, deps = {}) {
  if (!scene || typeof scene.add !== 'function') throw new Error('createChipLayer needs a THREE.Scene');
  const group = new THREE.Group();
  group.name = 'chips';
  scene.add(group);
  const layer = {
    scene,
    group,
    deps,
    jobs: [],
    pumping: false,
    raf: 0,
    epoch: 0,
    handNumber: null,
    bets: new Map(),
    homes: new Map(),
    amounts: new Map(),
    pot: [],
    won: [],
  };
  liveLayers.add(layer);
  restoreHomes(layer);
  return layer;
}

/** Match personal stacks to public seat totals. Seeds the center pot from blinds. */
export function syncStacks(state) {
  const seats = state && Array.isArray(state.seats) ? state.seats : null;
  for (const layer of liveLayers) {
    if (seats) {
      for (const seat of seats) {
        if (!seat || !seat.id || !Number.isFinite(seat.stack)) continue;
        layer.amounts.set(seat.id, seat.stack);
        setHomeCount(layer, seat.id, chipsForStack(seat.stack));
      }
    }
    restoreHomes(layer);
    const potAmount = state && Number.isFinite(state.pot) ? state.pot : 0;
    if (potAmount > 0 && layer.pot.length === 0) placePot(layer, chipsForBet(potAmount), 0);
  }
}

export function playChipAnimation(layer, action) {
  watchHand(layer, action && action.handNumber);
  const plan = readAction(action);
  if (!plan || (!plan.spend && plan.winners.length === 0)) return Promise.resolve();

  const run = async () => {
    const epoch = layer.epoch;
    if (plan.spend) {
      const spend = plan.spend;
      const stack = takeBet(layer, spend.flyId, spend.amount, spend.allIn, spend.remain);
      const from = { x: stack.position.x, y: stack.position.y, z: stack.position.z };
      await glide(layer, stack, from, potChipPoint(layer, layer.pot.length), 0, 0.58);
      if (layer.epoch !== epoch) return;
      layer.pot.push(stack);
      if (Number.isFinite(spend.remain)) layer.amounts.set(spend.flyId, spend.remain);
      else if (spend.allIn) layer.amounts.set(spend.flyId, 0);
    }
    if (!plan.winners.length || layer.epoch !== epoch) return;

    const moving = layer.pot.splice(0, layer.pot.length);
    if (!moving.length) {
      for (let i = 0; i < plan.winners.length; i++) {
        const pile = placePot(layer, chipsForBet(plan.winners[i].amount), i);
        moving.push(pile);
      }
      layer.pot = [];
    }
    await Promise.all(moving.map((stack, index) => {
      const win = plan.winners[index % plan.winners.length];
      const home = ensureHome(layer, win.id);
      const from = { x: stack.position.x, y: stack.position.y, z: stack.position.z };
      const to = { x: home.position.x, y: home.position.y, z: home.position.z };
      return glide(layer, stack, from, to, index * 0.06, 0.64).then(() => {
        if (layer.epoch !== epoch) return;
        absorb(home, stack);
        const gained = Number.isFinite(win.amount) ? win.amount : 0;
        const prev = layer.amounts.has(win.id) ? layer.amounts.get(win.id) : null;
        if (prev != null) layer.amounts.set(win.id, prev + gained);
      });
    }));
  };

  return run();
}
