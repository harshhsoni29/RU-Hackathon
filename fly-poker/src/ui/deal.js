/**
 * Hole cards and the board.
 * Cards leave the dealer deck and travel; they are never placed fully formed.
 * Rank and suit are drawn on one face only (the box's +Z face). That face is
 * aimed at the fly the card belongs to. The opposite face is the back, and it
 * points back toward the table, so the center and a camera on the rail see
 * the back. Flop, turn, and river cards land face-up.
 */

import * as THREE from 'three';
import { releaseHand } from './chips.js';
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
};

const HOLE_STAGGER = 0.1;
const HOLE_TIME = 0.78;
const BOARD_STAGGER = 0.42;
const BOARD_TIME = 0.96;
const BOARD_GAP = 0.3;

const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
const sideMat = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.62 });

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
  const face = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.55,
    map: textureOf(deps, rank, suit),
  });
  const back = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.55,
    map: backTexture(deps),
  });
  // Box faces are +X, -X, +Y, -Y, +Z, -Z. Rank sits on +Z only.
  const mesh = new THREE.Mesh(cardGeo, [sideMat, sideMat, sideMat, sideMat, face, back]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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

function dealerAnchor(layer) {
  const fn = layer.deps && layer.deps.getDealerWorldPosition;
  const got = typeof fn === 'function' ? readVec(fn()) : null;
  if (got) return got;
  const dealer = layer.deps && layer.deps.dealer && readVec(layer.deps.dealer.position);
  if (dealer) return dealer;
  const deck = layer.deps && readVec(layer.deps.deck);
  return deck || { x: 0, y: FELT_Y, z: -OVAL_RZ };
}

function flyAnchor(layer, id) {
  const fn = layer.deps && layer.deps.getFlyWorldPosition;
  const got = typeof fn === 'function' ? readVec(fn(id)) : null;
  if (got) return got;
  const seat = seatRecord(layer, id);
  const pos = seat && readVec(seat.position);
  return pos || fallbackFly(id);
}

function deckPoint(layer) {
  const deck = layer.deps && readVec(layer.deps.deck);
  if (deck) return deck;
  const dealer = dealerAnchor(layer);
  const board = boardAnchor(layer);
  const dx = board.x - dealer.x;
  const dz = board.z - dealer.z;
  const len = Math.hypot(dx, dz) || 1;
  // A beetle standing off the cloth needs the deck slid onto the felt.
  // A point that is already the shoe stays put.
  const pull = len > 1.6 ? Math.min(0.5, len - 1.15) : 0;
  return {
    x: dealer.x + (dx / len) * pull,
    y: board.y,
    z: dealer.z + (dz / len) * pull,
  };
}

function holeSpot(layer, flyId, index) {
  const fly = flyAnchor(layer, flyId);
  const center = boardAnchor(layer);
  const side = index === 0 ? -1 : 1;
  const seat = seatRecord(layer, flyId);
  const parked = seat && readVec(seat.cardAnchor);
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
  if (parked) {
    return {
      x: parked.x + (-uz) * side * 0.1,
      z: parked.z + ux * side * 0.1,
      surface: parked.y,
      flyX: fly.x,
      flyZ: fly.z,
      fan: index === 0 ? -0.14 : 0.14,
    };
  }
  // In front of the fly and outside the head when cardAnchor is missing.
  const gap = Math.min(1.2, Math.max(0.7, len - 0.2));
  const dist = len - gap;
  return {
    x: center.x + ux * dist + (-uz) * side * 0.1,
    z: center.z + uz * dist + ux * side * 0.1,
    surface: center.y,
    flyX: fly.x,
    flyZ: fly.z,
    fan: index === 0 ? -0.14 : 0.14,
  };
}

function boardSpot(layer, index) {
  const anchor = boardAnchor(layer);
  return {
    x: anchor.x + (index - 2) * BOARD_GAP,
    z: anchor.z + 0.02,
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

/** Board flip: face-down, then +Z sweeps up through the table so the rank ends on top. */
function aimBoard(mesh, flip) {
  const angle = -Math.PI / 2 + Math.PI * flip;
  axisZ.set(0, Math.sin(angle), Math.cos(angle));
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
    const standY = spot.surface + 0.2;
    mesh.position.set(x, flatY + (standY - flatY) * reveal + arc, z);
    aimHole(mesh, spot.flyX - x, spot.flyZ - z, reveal, spot.fan * Math.max(reveal, 0.25));
  }, onDone);
}

function flyBoard(layer, card, index, delay, onDone) {
  const spot = boardSpot(layer, index);
  const deck = deckPoint(layer);
  const mesh = makeCard(layer.deps, card.rank, card.suit);
  mesh.userData = { kind: 'board', index, code: card.rank + card.suit };
  layer.group.add(mesh);
  layer.board[index] = mesh;
  const peel = (index % 5) * 0.003;
  return track(layer, 'board', delay, BOARD_TIME, (u) => {
    const travel = 0.58;
    let along;
    let flip;
    let arc;
    if (u < travel) {
      along = smooth(u / travel);
      flip = 0;
      arc = Math.sin(Math.PI * along) * 0.36;
    } else {
      along = 1;
      flip = smooth((u - travel) / (1 - travel));
      arc = Math.sin(Math.PI * flip) * 0.16;
    }
    const x = deck.x + (spot.x - deck.x) * along;
    const z = deck.z + (spot.z - deck.z) * along;
    mesh.position.set(x, spot.surface + 0.012 + peel * (1 - along) + arc, z);
    aimBoard(mesh, flip);
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
  scene.add(group);
  return {
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
  };
}

export function playDealAnimation(layer, publicState) {
  const state = publicState || {};
  const seats = state.seats || [];
  const nextHoleKey = holeSignature(state);
  const nextBoard = (state.board || []).map(cardCode);
  const tasks = [];

  if (layer.holeKey !== nextHoleKey) {
    releaseHand(state.handNumber ?? nextHoleKey);
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
