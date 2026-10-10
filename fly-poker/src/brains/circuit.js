/**
 * Fixed sparse recurrent circuit.
 * Not the larval or FlyWire adjacency matrix — see brains/README.md.
 * Signs are frozen. Each fly stores its own positive gains on these edges.
 */

import { makeRng } from '../poker/rng.js';

export const ACTIONS = ['fold', 'check', 'call', 'bet', 'raise'];

const S = 12;
const K = 10;
const C = 10;
const D = 8;
const M = ACTIONS.length;

const S0 = 0;
const K0 = S;
const C0 = S + K;
const D0 = S + K + C;
export const MOTOR0 = S + K + C + D;

const SENSORY_LABELS = [
  'Hand strength',
  'Pot odds',
  'Stack-to-pot',
  'Street',
  'In position',
  'To-call fraction',
  'Board heat',
  'Draw equity',
  'Opponent aggression',
  'Opponent VPIP',
  'Invested fraction',
  'Bluff window',
];

export const NODES = [];
function addPool(layer, count, labelAt) {
  const x = ['sensory', 'kenyon', 'central', 'descending', 'motor'].indexOf(layer);
  for (let i = 0; i < count; i++) {
    NODES.push({ id: `${layer[0]}${i}`, layer, x, y: i, label: labelAt(i) });
  }
}
addPool('sensory', S, (i) => SENSORY_LABELS[i]);
addPool('kenyon', K, (i) => `Kenyon ${i}`);
addPool('central', C, (i) => (i % 2 === 1 ? `Central ${i} inhibitory` : `Central ${i}`));
addPool('descending', D, (i) => `Descending ${i}`);
addPool('motor', M, (i) => ACTIONS[i]);

export const CIRCUIT_META = Object.freeze({
  literalConnectome: false,
  steps: 4,
  leak: 0.6,
  seed: 20230310,
  sensory: S,
  kenyon: K,
  central: C,
  descending: D,
  motor: M,
  description:
    'Connectome-inspired sensory → Kenyon → central recurrent → descending readout. Fixed signs, learned positive gains. Not the 3,016-neuron larval graph.',
});

function reservoirSign(from) {
  if (from >= C0 && from < D0 && (from - C0) % 2 === 1) return -1;
  return 1;
}

function choose(rng, start, length, count, forbid) {
  const picked = [];
  let guard = 0;
  while (picked.length < count && guard < 50) {
    guard++;
    const i = start + Math.floor(rng() * length);
    if (i === forbid || picked.includes(i)) continue;
    picked.push(i);
  }
  return picked;
}

function buildTemplate() {
  const rng = makeRng(CIRCUIT_META.seed).next;
  const edges = [];
  const add = (from, to, sign, initialGain) => {
    edges.push({ from, to, sign, initialGain });
  };
  for (let i = 0; i < K; i++) {
    for (const src of choose(rng, S0, S, 3, -1)) add(src, K0 + i, 1, 1);
  }
  for (let i = 0; i < C; i++) {
    const target = C0 + i;
    for (const src of choose(rng, K0, K, 2, -1)) add(src, target, reservoirSign(src), 1);
    for (const src of choose(rng, C0, C, 2, target)) add(src, target, reservoirSign(src), 1);
    for (const src of choose(rng, D0, D, 1, -1)) add(src, target, reservoirSign(src), 1);
  }
  for (let i = 0; i < D; i++) {
    const target = D0 + i;
    for (const src of choose(rng, C0, C, 2, -1)) add(src, target, reservoirSign(src), 1);
    for (const src of choose(rng, D0, D, 1, target)) add(src, target, reservoirSign(src), 1);
    for (const src of choose(rng, K0, K, 1, -1)) add(src, target, 1, 1);
  }
  for (let a = 0; a < M; a++) {
    for (let j = 0; j < D; j++) {
      const mag = 0.35 + rng() * 0.65;
      const sign = rng() < 0.5 ? -1 : 1;
      add(D0 + j, MOTOR0 + a, sign, mag);
    }
  }
  return edges;
}

const TEMPLATE = buildTemplate();

export function createBrain() {
  return {
    edges: TEMPLATE.map((e) => ({
      from: e.from,
      to: e.to,
      sign: e.sign,
      gain: e.initialGain,
    })),
  };
}

function squash(x) {
  return x > 0 ? x / (1 + x) : 0;
}

/**
 * Four leaky recurrent steps. Sensory current is reapplied each step.
 * @returns {{ drive: number[], netLogits: number[] }}
 */
export function forward(brain, features) {
  if (features.length !== S) throw new Error(`expected ${S} sensory features`);
  const width = K + C + D;
  let h = new Array(width).fill(0);
  const leak = CIRCUIT_META.leak;
  for (let step = 0; step < CIRCUIT_META.steps; step++) {
    const pre = new Array(width).fill(0);
    for (const e of brain.edges) {
      if (e.to >= MOTOR0) continue;
      const fromAct = e.from < S ? features[e.from] : h[e.from - S];
      pre[e.to - S] += fromAct * e.sign * e.gain;
    }
    const next = new Array(width);
    for (let i = 0; i < width; i++) next[i] = (1 - leak) * h[i] + leak * squash(pre[i]);
    h = next;
  }
  const netLogits = [0, 0, 0, 0, 0];
  for (const e of brain.edges) {
    if (e.to < MOTOR0) continue;
    const fromAct = h[e.from - S];
    netLogits[e.to - MOTOR0] += e.sign * e.gain * fromAct;
  }
  const drive = features.concat(h);
  return { drive, netLogits };
}

export function nodeId(index) {
  return NODES[index].id;
}
