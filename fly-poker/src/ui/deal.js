/**
 * Hole cards and the board.
 * Cards leave the dealer deck and travel; they are never placed fully formed.
 * Rank and suit are drawn on one face only (the box's +Z face). That face is
 * aimed at the fly the card belongs to. The opposite face is the back, and it
 * points back toward the table, so the center and a camera on the rail see
 * the back. Flop, turn, and river cards land face-up.
 */

import * as THREE from 'three';
import { releaseHand, syncStacks } from './chips.js';
import { bindThree, cardBackTexture, cardTexture } from './textures.js';

const CARD_W = 0.26;
const CARD_H = 0.36;
const CARD_D = 0.018;
const FELT_Y = 0.8;
const OVAL_RX = 6;
const OVAL_RZ = 3.2;
const FALLBACK_ANGLE = {
  vera: (210 * Math.PI) / 180,
  buzz: (-30 * Math.PI) / 180,
  nib: (30 * Math.PI) / 180,
  callie: (150 * Math.PI) / 180,
  mani: (90 * Math.PI) / 180,
  soni: (135 * Math.PI) / 180,
};

const HOLE_STAGGER = 0.1;
const HOLE_TIME = 0.78;
const BOARD_STAGGER = 0.42;
const BOARD_TIME = 0.96;
const BOARD_GAP = 0.72;
const BOARD_SCALE = 1.7;
const HOLE_SCALE = 1.35;
const BET_HOLE_SCALE = 2.2;
/** Standing hole cards sit this far above the board anchor so the tilted bottom clears the felt. */
const HOLE_STAND = 0.3;
/** Hole-card centers stay this far inside the felt edge, clear of the rail. */
const HOLE_RIM_INSET = 0.85;

const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
const sideMat = new THREE.MeshLambertMaterial({ color: 0xf3ead8 });

const faceCache = new Map();
let backMap = null;

const axisX = new THREE.Vector3();
const axisY = new THREE.Vector3();
const axisZ = new THREE.Vector3();
const topHint = new THREE.Vector3();
const basis = new THREE.Matrix4();
const fallbackUp = new THREE.Vector3(0, 1, 0);

const raf = globalThis.requestAnimationFrame
  ? (fn) => globalThis.requestAnimationFrame(fn)
  : (fn) => setTimeout(() => fn(performance.now()), 16);

function commit(object) {
  object.matrixAutoUpdate = false;
  object.updateMatrix();
}

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

function rankSuit(card) {
  if (!card) return null;
  if (typeof card === 'string' && card.length >= 2) return { rank: card[0], suit: card[1] };
  if (card.rank && card.suit) return { rank: card.rank, suit: card.suit };
  return null;
}

function cardCode(card) {
  const rs = rankSuit(card);
  return rs ? rs.rank + rs.suit : '';
}

function textureOf(deps, rank, suit) {
  const key = rank + suit;
  let tex = faceCache.get(key);
  if (tex) return tex;
  const helper = deps && (deps.cardTexture || deps.cardFaceTexture || deps.faceTexture);
  tex = typeof helper === 'function' ? helper(rank, suit) : cardTexture(rank, suit);
  faceCache.set(key, tex);
  return tex;
}

function backTexture(deps) {
  if (backMap) return backMap;
  const helper = deps && (deps.cardBackTexture || deps.backTexture);
  backMap = typeof helper === 'function' ? helper() : cardBackTexture();
  return backMap;
}

function makeCard(deps, rank, suit) {
  const face = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: textureOf(deps, rank, suit),
  });
  const back = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: backTexture(deps),
  });
  // Box faces are +X, -X, +Y, -Y, +Z, -Z. Rank sits on +Z only.
  const mesh = new THREE.Mesh(cardGeo, [sideMat, sideMat, sideMat, sideMat, face, back]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function dropCard(mesh) {
  mesh.removeFromParent();
  mesh.material[4].dispose();
  mesh.material[5].dispose();
}

function fallbackFly(id) {
  const angle = FALLBACK_ANGLE[id] ?? 0;
  return {
    x: Math.cos(angle) * OVAL_RX,
    y: 1.05,
    z: Math.sin(angle) * OVAL_RZ,
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

function feltRadii(layer) {
  const table = layer.deps && layer.deps.table;
  return {
    rx: (layer.deps && layer.deps.feltRx) || (table && table.feltRx) || 4.9,
    rz: (layer.deps && layer.deps.feltRz) || (table && table.feltRz) || 3.6,
  };
}

function dealerAnchor(layer) {
  const fn = layer.deps && layer.deps.getDealerWorldPosition;
  const got = typeof fn === 'function' ? readVec(fn()) : null;
  if (got) return got;
  const dealer = layer.deps && layer.deps.dealer && readVec(layer.deps.dealer.position);
  return dealer;
}

function flyAnchor(layer, id) {
  const fn = layer.deps && layer.deps.getFlyWorldPosition;
  const got = typeof fn === 'function' ? readVec(fn(id)) : null;
  if (got) return got;
  const seat = seatRecord(layer, id);
  const pos = seat && readVec(seat.position);
  return pos || fallbackFly(id);
}

/**
 * Shoe on the felt, just in front of Chip. Prefer the beetle's world position
 * and stop inside the cloth along that ray. With no dealer position, sit at
 * the south end of the oval, where the higher dealer seat is.
 */
function deckPoint(layer) {
  const board = boardAnchor(layer);
  const dealer = dealerAnchor(layer);
  let dx = 0;
  let dz = -1;
  if (dealer) {
    dx = dealer.x - board.x;
    dz = dealer.z - board.z;
  }
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const { rx, rz } = feltRadii(layer);
  const feltDist = 1 / Math.hypot(ux / rx, uz / rz);
  const dist = Math.max(0.4, feltDist - 0.28);
  return {
    x: board.x + ux * dist,
    y: board.y,
    z: board.z + uz * dist,
  };
}

function buildShoe(layer) {
  const spot = deckPoint(layer);
  const board = boardAnchor(layer);
  const shoe = new THREE.Group();
  shoe.name = 'deck';
  const back = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: backTexture(layer.deps),
  });
  const face = new THREE.MeshLambertMaterial({ color: 0xf3ead8 });
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(cardGeo, [sideMat, sideMat, sideMat, sideMat, face, back]);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = CARD_D * (i + 0.5);
    mesh.rotation.z = (i - 5) * 0.012;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    commit(mesh);
    shoe.add(mesh);
  }
  shoe.position.set(spot.x, spot.y, spot.z);
  shoe.rotation.y = Math.atan2(board.x - spot.x, board.z - spot.z);
  commit(shoe);
  layer.group.add(shoe);
  layer.shoe = shoe;
}

function holeSpot(layer, flyId, index) {
  const fly = flyAnchor(layer, flyId);
  const center = boardAnchor(layer);
  const side = index === 0 ? -1 : 1;
  let dx = fly.x - center.x;
  let dz = fly.z - center.z;
  let len = Math.hypot(dx, dz);
  if (len < 1e-4) {
    dx = 0;
    dz = 1;
    len = 1;
  }
  const ux = dx / len;
  const uz = dz / len;
  const { rx, rz } = feltRadii(layer);
  const feltDist = 1 / Math.hypot(ux / rx, uz / rz);
  // Near the fly, inside the rail, and outside that fly's chip columns.
  const dist = Math.max(1.1, feltDist - HOLE_RIM_INSET);
  const spread = BET_HOLE_SCALE * CARD_W * 0.62;
  return {
    x: center.x + ux * dist + (-uz) * side * spread,
    z: center.z + uz * dist + ux * side * spread,
    surface: center.y,
    flyX: fly.x,
    flyZ: fly.z,
    fan: index === 0 ? -0.16 : 0.16,
  };
}

function boardSpot(layer, index) {
  const anchor = boardAnchor(layer);
  return {
    x: anchor.x + (index - 2) * BOARD_GAP,
    z: anchor.z,
    surface: anchor.y,
  };
}

/**
 * Aim the card's +Z face.
 * reveal 0: face points at the felt (back is up).
 * reveal 1: face points at the fly and slightly down, so the back points
 * toward the table and slightly up. Center and rail cameras see that back.
 */
function aimHole(mesh, toFlyX, toFlyZ, reveal, fan) {
  let hx = toFlyX;
  let hz = toFlyZ;
  const span = Math.hypot(hx, hz);
  if (span < 1e-4) {
    hx = 0;
    hz = 1;
  } else {
    hx /= span;
    hz /= span;
  }
  const aimLen = Math.hypot(hx, -0.32, hz);
  const ax = hx / aimLen;
  const ay = -0.32 / aimLen;
  const az = hz / aimLen;
  const fx = ax * reveal;
  const fy = -1 + (ay + 1) * reveal;
  const fz = az * reveal;
  const flen = Math.hypot(fx, fy, fz) || 1;
  axisZ.set(fx / flen, fy / flen, fz / flen);

  topHint.set(hx * (1 - reveal), reveal, hz * (1 - reveal));
  if (topHint.lengthSq() < 1e-8) topHint.copy(fallbackUp);
  else topHint.normalize();

  axisX.crossVectors(topHint, axisZ);
  if (axisX.lengthSq() < 1e-8) {
    axisX.crossVectors(fallbackUp, axisZ);
    if (axisX.lengthSq() < 1e-8) axisX.set(1, 0, 0);
  }
  axisX.normalize();
  axisY.crossVectors(axisZ, axisX).normalize();
  basis.makeBasis(axisX, axisY, axisZ);
  mesh.quaternion.setFromRotationMatrix(basis);
  if (fan) mesh.rotateZ(fan);
}

/**
 * Board flip. flip 0 is face-down. flip 1 leaves the rank facing up and
 * leaned toward the rail camera (+Z) so the center row is readable.
 */
function aimBoard(mesh, flip) {
  if (flip >= 0.98) {
    mesh.quaternion.copy(faceUpQuaternion());
    return;
  }
  const lean = 0.62 * flip;
  const sweep = Math.sin(-Math.PI / 2 + Math.PI * flip);
  const yy = sweep * Math.cos(lean);
  const zz = Math.sin(lean);
  const flen = Math.hypot(yy, zz) || 1;
  axisZ.set(0, yy / flen, zz / flen);
  axisX.set(1, 0, 0);
  axisY.crossVectors(axisZ, axisX).normalize();
  basis.makeBasis(axisX, axisY, axisZ);
  mesh.quaternion.setFromRotationMatrix(basis);
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

function cancelKind(layer, kind) {
  const jobs = layer.jobs;
  const dropped = [];
  for (let i = jobs.length - 1; i >= 0; i--) {
    if (jobs[i].kind !== kind) continue;
    dropped.push(jobs.splice(i, 1)[0]);
  }
  for (const job of dropped) job.done();
}

function clearHoles(layer) {
  for (const mesh of layer.holes.values()) dropCard(mesh);
  layer.holes.clear();
}

function clearBoard(layer) {
  for (const mesh of layer.board) if (mesh) dropCard(mesh);
  layer.board = [];
  layer.boardCodes = [];
}

function tint(mesh, folded) {
  const color = folded ? 0xb7b1a6 : 0xffffff;
  mesh.material[4].color.setHex(color);
  mesh.material[5].color.setHex(color);
}

function holeSignature(state) {
  const hand = state.handNumber ?? 0;
  const seats = state.seats || [];
  const body = seats.map((seat) => `${seat.id}:${(seat.holeCards || []).map(cardCode).join('')}`).join('|');
  return `${hand}#${body}`;
}

function dealOrder(seats, buttonId) {
  const live = seats.filter((seat) => (seat.holeCards || []).some((card) => rankSuit(card)));
  if (!buttonId) return live;
  const buttonAt = seats.findIndex((seat) => seat.id === buttonId);
  if (buttonAt < 0) return live;
  const after = [];
  const before = [];
  for (const seat of live) {
    const index = seats.indexOf(seat);
    if (index > buttonAt) after.push(seat);
    else before.push(seat);
  }
  return after.concat(before);
}

function track(layer, kind, delay, duration, apply, onDone) {
  let settled = false;
  const job = {
    kind,
    t0: performance.now() + delay * 1000,
    duration: Math.max(16, duration * 1000),
    apply,
    done() {
      if (settled) return;
      settled = true;
      onDone();
    },
  };
  apply(0);
  layer.jobs.push(job);
  startPump(layer);
}

function flyHole(layer, seat, index, card, delay, onDone) {
  const spot = holeSpot(layer, seat.id, index);
  const deck = deckPoint(layer);
  const mesh = makeCard(layer.deps, card.rank, card.suit);
  mesh.scale.set(HOLE_SCALE, HOLE_SCALE, 1);
  mesh.userData = { kind: 'hole', flyId: seat.id, index, code: card.rank + card.suit };
  layer.group.add(mesh);
  layer.holes.set(`${seat.id}:${index}`, mesh);
  tint(mesh, !!seat.folded);
  const peel = index * 0.004;
  return track(layer, 'hole', delay, HOLE_TIME, (u) => {
    const travel = 0.68;
    let along;
    let reveal;
    let arc;
    if (u < travel) {
      along = smooth(u / travel);
      reveal = 0;
      arc = Math.sin(Math.PI * along) * 0.4;
    } else {
      along = 1;
      reveal = smooth((u - travel) / (1 - travel));
      arc = 0;
    }
    const x = deck.x + (spot.x - deck.x) * along;
    const z = deck.z + (spot.z - deck.z) * along;
    const flatY = spot.surface + 0.012 + peel * (1 - along);
    const standY = spot.surface + HOLE_STAND;
    mesh.position.set(x, flatY + (standY - flatY) * reveal + arc, z);
    aimHole(mesh, spot.flyX - x, spot.flyZ - z, reveal, spot.fan * Math.max(reveal, 0.25));
    mesh.updateMatrix();
  }, onDone);
}

function flyBoard(layer, card, index, delay, onDone) {
  const spot = boardSpot(layer, index);
  const deck = deckPoint(layer);
  const mesh = makeCard(layer.deps, card.rank, card.suit);
  mesh.scale.set(BOARD_SCALE, BOARD_SCALE, 1);
  mesh.userData = { kind: 'board', index, code: card.rank + card.suit };
  layer.group.add(mesh);
  layer.board[index] = mesh;
  const peel = (index % 5) * 0.004;
  const restY = spot.surface + 0.045;
  return track(layer, 'board', delay, BOARD_TIME, (u) => {
    const travel = 0.58;
    let along;
    let flip;
    let arc;
    if (u < travel) {
      along = smooth(u / travel);
      flip = 0;
      arc = Math.sin(Math.PI * along) * 0.42;
    } else {
      along = 1;
      flip = smooth((u - travel) / (1 - travel));
      arc = Math.sin(Math.PI * flip) * 0.18;
    }
    const x = deck.x + (spot.x - deck.x) * along;
    const z = deck.z + (spot.z - deck.z) * along;
    const y = spot.surface + 0.04 + (restY - spot.surface - 0.04) * flip + peel * (1 - along) + arc;
    mesh.position.set(x, y, z);
    aimBoard(mesh, flip);
    mesh.updateMatrix();
  }, onDone);
}

function refreshTint(layer, state) {
  for (const seat of state.seats || []) {
    for (let i = 0; i < 2; i++) {
      const mesh = layer.holes.get(`${seat.id}:${i}`);
      if (mesh) tint(mesh, !!seat.folded);
    }
  }
}

export function createDealLayer(scene, deps = {}) {
  bindThree(THREE);
  if (!scene || typeof scene.add !== 'function') throw new Error('createDealLayer needs a THREE.Scene');
  const group = new THREE.Group();
  group.name = 'deal';
  group.matrixAutoUpdate = false;
  scene.add(group);
  const layer = {
    scene,
    group,
    deps,
    jobs: [],
    holes: new Map(),
    board: [],
    boardCodes: [],
    holeKey: null,
    pumping: false,
    raf: 0,
    shoe: null,
  };
  buildShoe(layer);
  return layer;
}

export function playDealAnimation(layer, publicState) {
  const state = publicState || {};
  const seats = state.seats || [];
  const nextHoleKey = holeSignature(state);
  const nextBoard = (state.board || []).map(cardCode);
  const tasks = [];

  if (layer.holeKey !== nextHoleKey) {
    releaseHand(state.handNumber ?? nextHoleKey);
    syncStacks(state);
    cancelKind(layer, 'hole');
    cancelKind(layer, 'board');
    clearHoles(layer);
    clearBoard(layer);
    layer.holeKey = nextHoleKey;
    const order = dealOrder(seats, state.buttonId);
    let delay = 0;
    for (let round = 0; round < 2; round++) {
      for (const seat of order) {
        const card = rankSuit((seat.holeCards || [])[round]);
        if (!card) continue;
        tasks.push({ kind: 'hole', seat, index: round, card, delay });
        delay += HOLE_STAGGER;
      }
    }
  }

  const boardSame = nextBoard.length >= layer.boardCodes.length
    && layer.boardCodes.every((code, i) => nextBoard[i] === code);
  if (!boardSame) {
    cancelKind(layer, 'board');
    clearBoard(layer);
  }
  const from = layer.boardCodes.length;
  let boardDelay = tasks.length ? tasks[tasks.length - 1].delay + HOLE_TIME : 0;
  for (let i = from; i < nextBoard.length; i++) {
    const card = rankSuit((state.board || [])[i]);
    if (!card) continue;
    if (i === 3 || i === 4) boardDelay += 0.22;
    tasks.push({ kind: 'board', index: i, card, delay: boardDelay });
    boardDelay += BOARD_STAGGER;
  }
  layer.boardCodes = nextBoard.slice();
  const flyingBoard = new Set(tasks.filter((task) => task.kind === 'board').map((task) => task.index));
  for (let i = 0; i < layer.board.length; i++) {
    if (flyingBoard.has(i)) continue;
    const mesh = layer.board[i];
    if (!mesh) continue;
    const spot = boardSpot(layer, i);
    mesh.position.set(spot.x, spot.surface + 0.045, spot.z);
    mesh.scale.set(BOARD_SCALE, BOARD_SCALE, 1);
    mesh.quaternion.copy(faceUpQuaternion());
    mesh.updateMatrix();
  }

  refreshTint(layer, state);
  if (!tasks.length) return Promise.resolve();

  return new Promise((resolve) => {
    let left = tasks.length;
    const onDone = () => {
      left -= 1;
      if (left <= 0) resolve();
    };
    for (const task of tasks) {
      if (task.kind === 'hole') flyHole(layer, task.seat, task.index, task.card, task.delay, onDone);
      else flyBoard(layer, task.card, task.index, task.delay, onDone);
    }
  });
}

let faceUpQuat = null;

function faceUpQuaternion() {
  if (faceUpQuat) return faceUpQuat;
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 1, 0),
  );
  faceUpQuat = new THREE.Quaternion().setFromRotationMatrix(m);
  return faceUpQuat;
}

/** mode 'top': every dealt card lies face-up. mode 'rail': holes face their fly; the board stays face-up. */
export function setCardView(layer, mode) {
  if (!layer) return;
  const top = mode === 'top';
  layer.cardView = top ? 'top' : 'rail';
  const felt = boardAnchor(layer).y;
  const quat = faceUpQuaternion();
  if (layer.holes) {
    layer.holes.forEach((mesh) => {
      if (!mesh) return;
      if (top) {
        mesh.scale.set(BET_HOLE_SCALE, BET_HOLE_SCALE, 1);
        mesh.position.y = felt + 0.03 + (mesh.userData.index || 0) * 0.006;
        mesh.quaternion.copy(quat);
        mesh.updateMatrix();
        return;
      }
      mesh.scale.set(HOLE_SCALE, HOLE_SCALE, 1);
      const spot = holeSpot(layer, mesh.userData.flyId, mesh.userData.index || 0);
      mesh.position.set(spot.x, spot.surface + HOLE_STAND, spot.z);
      aimHole(mesh, spot.flyX - spot.x, spot.flyZ - spot.z, 1, spot.fan);
      mesh.updateMatrix();
    });
  }
  const board = layer.board || [];
  for (let i = 0; i < board.length; i++) {
    const mesh = board[i];
    if (!mesh) continue;
    if (top) {
      mesh.position.y = felt + 0.02 + i * 0.003;
      mesh.quaternion.copy(quat);
      mesh.updateMatrix();
      continue;
    }
    const spot = boardSpot(layer, mesh.userData.index ?? i);
    mesh.position.set(spot.x, spot.surface + 0.045 + (i % 5) * 0.003, spot.z);
    mesh.scale.set(BOARD_SCALE, BOARD_SCALE, 1);
    mesh.quaternion.copy(quat);
    mesh.updateMatrix();
  }
}
