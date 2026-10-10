/**
 * Chip travel for bets and pots.
 * A bet, call, or raise slides a clay stack from that fly to the center of
 * the felt and leaves it there. Check and fold move nothing. A won pot slides
 * from the center to the winner and stays until the next deal.
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
  const pot = potAnchor(layer);
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
  const onCloth = feltDist - 0.06;
  const dist = Math.max(0.35, Math.min(closeToFly, onCloth));
  const side = (slot - 0.5) * 0.12;
  return {
    x: center.x + ux * dist + (-uz) * side,
    y: pot.y + 0.03,
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

function chipCount(amount) {
  const n = 4 + Math.floor((amount > 0 ? amount : 10) / 30);
  return Math.max(4, Math.min(8, n));
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

function makeStack(amount, colorIndex) {
  const group = new THREE.Group();
  const n = chipCount(amount);
  for (let i = 0; i < n; i++) {
    const look = DENOM[(colorIndex + (i % 2)) % DENOM.length];
    const chip = makeChip(look, i * 0.2);
    chip.position.y = CHIP_H * 0.5 + i * (CHIP_H + 0.003);
    chip.rotation.y = i * 0.48;
    group.add(chip);
  }
  return group;
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
    spend: spends ? { flyId, amount } : null,
    winners,
  };
}

function wipe(layer) {
  layer.epoch += 1;
  const jobs = layer.jobs.splice(0, layer.jobs.length);
  for (const job of jobs) job.done();
  layer.group.clear();
  layer.bets.clear();
  layer.pot = [];
  layer.won = [];
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
    pot: [],
    won: [],
  };
  liveLayers.add(layer);
  return layer;
}

export function playChipAnimation(layer, action) {
  watchHand(layer, action && action.handNumber);
  const plan = readAction(action);
  if (!plan || (!plan.spend && plan.winners.length === 0)) return Promise.resolve();

  const run = async () => {
    const epoch = layer.epoch;
    if (plan.spend) {
      const stack = makeStack(plan.spend.amount, layer.pot.length);
      stack.userData.kind = 'pot';
      layer.group.add(stack);
      const from = inFrontOfFly(layer, plan.spend.flyId, 0);
      await glide(layer, stack, from, potChipPoint(layer, layer.pot.length), 0, 0.58);
      if (layer.epoch !== epoch) return;
      layer.pot.push(stack);
    }
    if (!plan.winners.length || layer.epoch !== epoch) return;

    const moving = layer.pot.splice(0, layer.pot.length);
    if (!moving.length) {
      for (const win of plan.winners) {
        const stack = makeStack(win.amount, layer.won.length);
        stack.userData.kind = 'pot';
        layer.group.add(stack);
        moving.push(stack);
      }
    }
    await Promise.all(moving.map((stack, index) => {
      const win = plan.winners[index % plan.winners.length];
      const from = {
        x: stack.position.x,
        y: stack.position.y,
        z: stack.position.z,
      };
      if (!layer.pot.length && from.x === 0 && from.y === 0 && from.z === 0) {
        const pot = potChipPoint(layer, index);
        from.x = pot.x;
        from.y = pot.y;
        from.z = pot.z;
      }
      return glide(layer, stack, from, inFrontOfFly(layer, win.id, index), index * 0.06, 0.64).then(() => {
        if (layer.epoch !== epoch) return;
        stack.userData.kind = 'won';
        layer.won.push(stack);
      });
    }));
  };

  return run();
}
