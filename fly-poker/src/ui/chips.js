/**
 * Chip travel for bets and pots.
 * Each fly keeps clay columns on the felt in front of them. One disc is 10
 * real chips. A column stops at its own height between 15 and 25 discs, then the next disc starts the column beside it,
 * then another row inward so a large stack stays on the felt. A bet peels that
 * difference off and slides it to the center pot, which uses the same columns.
 * A won pot slides back onto the winner. Zero chips leaves the felt empty.
 * Resting and traveling discs are instanced. Nothing here allocates geometry
 * per frame, and chips do not cast or receive shadows.
 */

import * as THREE from 'three';

const FELT_Y = 0.8;
const liveLayers = new Set();
const CHIP_R = 0.056;
const CHIP_H = 0.014;
const CHIP_STEP = 0.0155;
/** One clay chip represents this many real chips from seats[].stack. */
const CHIP_UNIT = 10;
/** Each pile picks its own column height in this range. */
const COLUMN_MIN = 15;
const COLUMN_MAX = 25;

function columnMaxFor(name) {
  let hash = 0;
  const text = String(name || 'pot');
  for (let i = 0; i < text.length; i++) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
  return COLUMN_MIN + (hash % (COLUMN_MAX - COLUMN_MIN + 1));
}
/** Columns across one row in front of a fly. The next row steps inward. */
const COLS_BESIDE = 5;
/** Pot stays a short row so it does not cover the community cards. */
const POT_COLS_BESIDE = 5;
/** Personal columns sit this far inside the hole cards, clear of the rail. */
const CHIP_RIM_INSET = 1.85;
const FELT_PAD = 0.16;
const COL_GAP = CHIP_R * 2 + 0.022;
const ROW_GAP = CHIP_R * 2 + 0.028;
/** Whole table is 5 * 1000 real chips. 1024 covers one pile holding all of them. */
const CAP = 1024;

const SPEND = new Set(['bet', 'call', 'raise']);

const bodyGeo = new THREE.CylinderGeometry(CHIP_R * 0.9, CHIP_R * 0.9, CHIP_H, 10);
const bandGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H * 0.42, 10);
const clayMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

const DENOM = [
  [0xc73a3a, 0xf6efe2],
  [0x2a5bd7, 0xf6efe2],
  [0x1f8a4a, 0xf7f3e8],
  [0x1a1816, 0xe6c15a],
  [0xf3ead2, 0xb4232c],
].map(([body, edge]) => ({ body, edge }));

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const lift = new THREE.Vector3();

function commit(object) {
  object.matrixAutoUpdate = false;
  object.updateMatrix();
}

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
    rx: (layer.deps && layer.deps.feltRx) || (table && table.feltRx) || 4.9,
    rz: (layer.deps && layer.deps.feltRz) || (table && table.feltRz) || 3.6,
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
  const ux = dx / len;
  const uz = dz / len;
  const { rx, rz } = feltRadii(layer);
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
  // Inward of the hole cards (those sit at feltDist - 0.4) and inside the rail.
  let dist = Math.max(0.7, feltDist - CHIP_RIM_INSET);
  let x = center.x + ux * dist;
  let z = center.z + uz * dist;
  const marginRx = Math.max(0.8, rx - 0.55);
  const marginRz = Math.max(0.5, rz - 0.45);
  const e = (x * x) / (marginRx * marginRx) + (z * z) / (marginRz * marginRz);
  if (e > 1) {
    const s = 1 / Math.sqrt(e);
    x *= s;
    z *= s;
  }
  const board = boardAnchor(layer);
  return {
    x,
    y: board.y + 0.025,
    z,
  };
}

/** On the felt toward the rail camera, below the community-card row. */
function potChipPoint(layer) {
  const board = boardAnchor(layer);
  return {
    x: board.x,
    y: board.y + 0.025,
    z: board.z + 2.05,
  };
}

/** Clay discs for a real chip count. Zero stays empty; any chips left show at least one. */
function chipsForStack(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.max(1, Math.round(amount / CHIP_UNIT));
}

function seatedIds(layer) {
  const seats = layer.deps && layer.deps.seats;
  if (Array.isArray(seats) && seats.length) {
    return seats.map((seat) => seat && seat.id).filter(Boolean);
  }
  return ['vera', 'buzz', 'nib', 'callie', 'mani', 'soni'];
}

function colorFor(layer, flyId) {
  const index = seatedIds(layer).indexOf(flyId);
  return index < 0 ? 0 : index;
}

/** Local spot for disc `index`. Column 0 is centered; the next columns step aside, then inward. */
function discLocal(index, colsBeside, columnMax) {
  const max = columnMax || COLUMN_MIN;
  const column = Math.floor(index / max);
  const level = index % max;
  const along = column % colsBeside;
  const rank = Math.floor(column / colsBeside);
  const side = along === 0 ? 0 : (along % 2 === 1 ? 1 : -1) * Math.ceil(along / 2);
  return {
    x: side * COL_GAP,
    y: CHIP_H * 0.5 + level * CHIP_STEP,
    z: -rank * ROW_GAP,
  };
}

function makeInstanced(geo) {
  const mesh = new THREE.InstancedMesh(geo, clayMat, CAP);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function makePile(name, kind, colorIndex, colsBeside) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.kind = kind;
  group.userData.colorIndex = colorIndex;
  group.userData.colsBeside = colsBeside;
  group.userData.columnMax = columnMaxFor(name);
  group.userData.count = 0;
  group.userData.capacity = CAP;
  group.userData.tints = new Uint8Array(CAP);
  group.userData.pooled = false;
  const body = makeInstanced(bodyGeo);
  const band = makeInstanced(bandGeo);
  group.matrixAutoUpdate = false;
  group.add(body, band);
  group.userData.body = body;
  group.userData.band = band;
  return group;
}

function pileCount(pile) {
  return pile && pile.userData ? pile.userData.count : 0;
}

function layoutPile(pile) {
  const n = pile.userData.count;
  const body = pile.userData.body;
  const band = pile.userData.band;
  const cols = pile.userData.colsBeside;
  const tints = pile.userData.tints;
  const span = DENOM.length;
  for (let i = 0; i < n; i++) {
    const spot = discLocal(i, cols, pile.userData.columnMax);
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.rotation.set(0, (i % 6) * 0.45, 0);
    dummy.updateMatrix();
    body.setMatrixAt(i, dummy.matrix);
    band.setMatrixAt(i, dummy.matrix);
    const denom = DENOM[tints[i] % span];
    tint.setHex(denom.body);
    body.setColorAt(i, tint);
    tint.setHex(denom.edge);
    band.setColorAt(i, tint);
  }
  body.count = n;
  band.count = n;
  body.visible = n > 0;
  band.visible = n > 0;
  body.instanceMatrix.needsUpdate = true;
  band.instanceMatrix.needsUpdate = true;
  if (body.instanceColor) body.instanceColor.needsUpdate = true;
  if (band.instanceColor) band.instanceColor.needsUpdate = true;
}

function setPileCount(pile, count, colorIndex) {
  if (!pile) return;
  const n = Math.max(0, Math.min(pile.userData.capacity, count | 0));
  if (colorIndex != null) pile.userData.colorIndex = colorIndex;
  const prev = pile.userData.count;
  if (n === prev) return;
  if (n > prev) {
    const base = pile.userData.colorIndex || 0;
    const tints = pile.userData.tints;
    const span = DENOM.length;
    for (let i = prev; i < n; i++) tints[i] = (base + (i % 2)) % span;
  }
  pile.userData.count = n;
  layoutPile(pile);
}

function orientHome(layer, home, flyId) {
  const at = inFrontOfFly(layer, flyId, 0);
  home.position.set(at.x, at.y, at.z);
  const center = boardAnchor(layer);
  const dx = at.x - center.x;
  const dz = at.z - center.z;
  const len = Math.hypot(dx, dz) || 1;
  // Local +X runs along the rail. Local -Z steps extra columns toward the pot.
  home.rotation.y = Math.atan2(dx / len, dz / len);
  commit(home);
}

function ensureHome(layer, flyId) {
  const existing = layer.homes.get(flyId);
  if (existing && existing.parent) return existing;
  const home = makePile(`stack-${flyId}`, 'home', colorFor(layer, flyId), COLS_BESIDE);
  home.userData.flyId = flyId;
  orientHome(layer, home, flyId);
  layer.group.add(home);
  layer.homes.set(flyId, home);
  return home;
}

function setHomeCount(layer, flyId, count) {
  const home = ensureHome(layer, flyId);
  setPileCount(home, count, colorFor(layer, flyId));
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

const RING_R = 0.62;
const RING_REST = 0.55;

function potRingTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const c = size / 2;
  g.fillStyle = 'rgba(230, 194, 122, 0.10)';
  g.beginPath();
  g.arc(c, c, c - 14, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#e6c27a';
  g.lineWidth = 12;
  g.beginPath();
  g.arc(c, c, c - 14, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.setLineDash([18, 14]);
  g.beginPath();
  g.arc(c, c, c - 44, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#e6c27a';
  g.font = '700 56px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('P O T', c, size - 86);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Gold ring on the felt that marks the pot area. Flashes when chips land in it. */
function ensurePotRing(layer, at) {
  if (layer.potRing) return layer.potRing;
  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(RING_R * 2, RING_R * 2),
    new THREE.MeshBasicMaterial({ map: potRingTexture(), transparent: true, opacity: RING_REST, depthWrite: false }),
  );
  ring.name = 'pot-ring';
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(at.x, at.y - 0.006, at.z + 0.22);
  ring.renderOrder = -1;
  ring.updateMatrix();
  ring.matrixAutoUpdate = false;
  layer.group.add(ring);
  layer.potRing = ring;
  return ring;
}

function flashPotRing(layer) {
  const ring = layer.potRing;
  if (!ring) return;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 700);
    ring.material.opacity = RING_REST + (1 - RING_REST) * (1 - t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function ensurePot(layer) {
  if (layer.potMesh && layer.potMesh.parent) return layer.potMesh;
  const pot = makePile('pot', 'pot', 2, POT_COLS_BESIDE);
  const at = potChipPoint(layer);
  ensurePotRing(layer, at);
  pot.position.set(at.x, at.y, at.z);
  // Local -Z is the next row. Point that toward the rail so rows stay below the cards.
  pot.rotation.y = Math.PI;
  commit(pot);
  layer.group.add(pot);
  layer.potMesh = pot;
  layer.pot = [pot];
  return pot;
}

function pointOf(object) {
  return { x: object.position.x, y: object.position.y, z: object.position.z };
}

function acquireTravel(layer) {
  const travel = layer.travelPool.pop() || makePile('travel', 'travel', 0, COLS_BESIDE);
  travel.userData.pooled = false;
  travel.userData.colsBeside = COLS_BESIDE;
  return travel;
}

function releaseTravel(layer, travel) {
  if (!travel || travel.userData.pooled) return;
  travel.userData.pooled = true;
  const at = layer.flying.indexOf(travel);
  if (at >= 0) layer.flying.splice(at, 1);
  travel.userData.count = 0;
  travel.userData.body.count = 0;
  travel.userData.band.count = 0;
  travel.userData.body.visible = false;
  travel.userData.band.visible = false;
  travel.removeFromParent();
  layer.travelPool.push(travel);
}

/** Detach the top discs so they slide as their own short columns. */
function peel(layer, host, count) {
  const have = pileCount(host);
  const n = Math.max(0, Math.min(count | 0, have));
  if (!n || !host) return null;
  const leave = have - n;
  const travel = acquireTravel(layer);
  const from = host.userData.tints;
  const to = travel.userData.tints;
  for (let i = 0; i < n; i++) to[i] = from[leave + i];
  travel.userData.colorIndex = host.userData.colorIndex;
  travel.userData.columnMax = host.userData.columnMax;
  travel.userData.count = n;
  layoutPile(travel);
  setPileCount(host, leave);
  const spot = discLocal(leave, host.userData.colsBeside, host.userData.columnMax);
  lift.set(spot.x, 0, spot.z);
  lift.applyQuaternion(host.quaternion);
  travel.position.set(host.position.x + lift.x, host.position.y, host.position.z + lift.z);
  travel.rotation.set(0, host.rotation.y, 0);
  commit(travel);
  layer.group.add(travel);
  layer.flying.push(travel);
  return travel;
}

function absorb(layer, dest, travel) {
  if (!dest || !travel || travel.userData.pooled) return;
  const base = pileCount(dest);
  const n = pileCount(travel);
  const next = Math.min(dest.userData.capacity, base + n);
  const copy = next - base;
  const tints = dest.userData.tints;
  const from = travel.userData.tints;
  for (let i = 0; i < copy; i++) tints[base + i] = from[i];
  dest.userData.count = next;
  layoutPile(dest);
  releaseTravel(layer, travel);
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
    for (let i = jobs.length - 1; i >= 0; i--) {
      const job = jobs[i];
      const u = now < job.t0 ? 0 : Math.min(1, (now - job.t0) / job.duration);
      job.apply(u);
      if (now < job.t0 + job.duration) continue;
      const last = jobs.length - 1;
      jobs[i] = jobs[last];
      jobs.pop();
      job.done();
    }
    if (jobs.length) layer.raf = raf(step);
    else layer.pumping = false;
  };
  layer.raf = raf(step);
}

function glide(layer, group, from, to, delay, duration) {
  return new Promise((resolve) => {
    let settled = false;
    const yaw0 = group.rotation.y;
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
        group.rotation.y = yaw0 + t * 0.8;
        group.updateMatrix();
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
  const flying = layer.flying.slice();
  for (const travel of flying) releaseTravel(layer, travel);
  if (layer.potMesh) setPileCount(layer.potMesh, 0);
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
  group.matrixAutoUpdate = false;
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
    potMesh: null,
    won: [],
    flying: [],
    travelPool: [],
  };
  liveLayers.add(layer);
  restoreHomes(layer);
  ensurePotRing(layer, potChipPoint(layer));
  return layer;
}

function readSeatStacks(source) {
  const seats = source && Array.isArray(source.seats) ? source.seats : null;
  if (!seats) return null;
  const stacks = new Map();
  for (const seat of seats) {
    if (!seat || !seat.id || !Number.isFinite(seat.stack)) continue;
    stacks.set(seat.id, seat.stack);
  }
  return stacks.size ? stacks : null;
}

function applySeatTotals(layer, stacks) {
  if (!stacks) return;
  for (const [id, amount] of stacks) {
    layer.amounts.set(id, amount);
    setHomeCount(layer, id, chipsForStack(amount));
  }
}

function applyPotTotal(layer, potAmount) {
  if (!Number.isFinite(potAmount)) return;
  const count = chipsForStack(potAmount);
  if (count <= 0) {
    if (layer.potMesh) setPileCount(layer.potMesh, 0);
    return;
  }
  setPileCount(ensurePot(layer), count, 2);
}

/** Match personal stacks and the center pot to a public state immediately. */
export function syncStacks(state) {
  const stacks = readSeatStacks(state);
  const potAmount = state && Number.isFinite(state.pot) ? state.pot : null;
  for (const layer of liveLayers) {
    if (stacks) applySeatTotals(layer, stacks);
    else restoreHomes(layer);
    if (potAmount != null) applyPotTotal(layer, potAmount);
  }
}

export function playChipAnimation(layer, action, publicState) {
  const state = publicState || null;
  watchHand(layer, (action && action.handNumber) || (state && state.handNumber));
  const plan = readAction(action);
  const stacks = readSeatStacks(state) || readSeatStacks(action);
  const spend = plan && plan.spend;
  const winners = plan ? plan.winners : [];
  if (!spend && winners.length === 0 && !stacks) return Promise.resolve();

  const run = async () => {
    const epoch = layer.epoch;
    if (spend && epoch === layer.epoch) {
      const home = ensureHome(layer, spend.flyId);
      const finalAmount = stacks && stacks.has(spend.flyId) ? stacks.get(spend.flyId) : spend.remain;
      const won = winners.some((row) => row.id === spend.flyId);
      const betDiscs = chipsForStack(spend.amount > 0 ? spend.amount : CHIP_UNIT);
      let leave = pileCount(home);
      if (!won && Number.isFinite(finalAmount)) leave = chipsForStack(finalAmount);
      else if (spend.allIn && !won) leave = 0;
      else leave = Math.max(0, pileCount(home) - Math.max(1, betDiscs));
      const moving = Math.max(0, pileCount(home) - leave);
      if (moving > 0) {
        const travel = peel(layer, home, moving);
        const pot = ensurePot(layer);
        if (travel) {
          await glide(layer, travel, pointOf(travel), pointOf(pot), 0, 0.58);
          if (layer.epoch !== epoch) return;
          absorb(layer, pot, travel);
          flashPotRing(layer);
        }
      }
    }
    if (winners.length && layer.epoch === epoch) {
      const pot = ensurePot(layer);
      if (pileCount(pot) === 0) {
        const seed = winners.reduce((sum, row) => sum + chipsForStack(row.amount), 0);
        setPileCount(pot, Math.max(1, seed), 2);
      }
      const weights = winners.map((row) => Math.max(1, chipsForStack(row.amount)));
      const weightTotal = weights.reduce((sum, n) => sum + n, 0);
      const total = pileCount(pot);
      const counts = weights.map((n) => Math.floor(total * n / weightTotal));
      let used = counts.reduce((sum, n) => sum + n, 0);
      for (let i = 0; used < total; i += 1) {
        counts[i % counts.length] += 1;
        used += 1;
      }
      const bundles = [];
      for (let i = 0; i < winners.length; i++) {
        const travel = peel(layer, pot, counts[i]);
        if (travel) bundles.push({ row: winners[i], travel });
      }
      await Promise.all(bundles.map(({ row, travel }, index) => {
        const home = ensureHome(layer, row.id);
        return glide(layer, travel, pointOf(travel), pointOf(home), index * 0.06, 0.64).then(() => {
          if (layer.epoch !== epoch) return;
          absorb(layer, home, travel);
        });
      }));
      if (layer.epoch !== epoch) return;
    }
    if (stacks) applySeatTotals(layer, stacks);
    if (state && Number.isFinite(state.pot)) applyPotTotal(layer, state.pot);
  };

  return run();
}
