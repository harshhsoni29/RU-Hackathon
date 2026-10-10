/**
 * Fly brain overlay.
 * Circuit: layered schematic lit by inspection.activity.
 * Brain: a Three.js volume. Optic lobes, central mass, mushroom bodies,
 * descending tract. A region's brightness is that section's real activity.
 * Drag orbits, the wheel zooms, Reset restores the camera.
 */

import * as THREE from 'three';

const LAYERS = ['sensory', 'kenyon', 'central', 'descending', 'motor'];
const LAYER_SIZE = [12, 10, 10, 8, 5];
const MOTOR = ['fold', 'check', 'call', 'bet', 'raise'];
const LAYER_TITLE = {
  sensory: 'Sensory',
  kenyon: 'Kenyon',
  central: 'Central',
  descending: 'Descending',
  motor: 'Motor',
};

const HOT = {
  sensory: [102, 250, 240],
  kenyon: [179, 154, 255],
  central: [255, 163, 77],
  descending: [255, 115, 71],
  motor: [255, 219, 102],
};
const REST = {
  sensory: [54, 120, 118],
  kenyon: [86, 78, 140],
  central: [120, 96, 70],
  descending: [140, 78, 58],
  motor: [140, 112, 64],
};

const BRAIN_REST = {
  sensory: [92, 219, 214],
  kenyon: [128, 148, 242],
  central: [158, 168, 204],
  descending: [250, 179, 92],
  motor: [242, 209, 140],
};
const BRAIN_HOT = {
  sensory: [102, 250, 240],
  kenyon: [179, 154, 255],
  central: [255, 163, 77],
  descending: [255, 115, 71],
  motor: [255, 214, 102],
};
const TISSUE = [
  { section: 'sensory', x: -1.22, y: 0.0, z: 0.02, rx: 0.74, ry: 0.58, rz: 0.46, n: 640 },
  { section: 'sensory', x: 1.22, y: 0.0, z: 0.02, rx: 0.74, ry: 0.58, rz: 0.46, n: 640 },
  { section: 'sensory', x: -0.68, y: 0.0, z: 0.0, rx: 0.26, ry: 0.2, rz: 0.16, n: 100 },
  { section: 'sensory', x: 0.68, y: 0.0, z: 0.0, rx: 0.26, ry: 0.2, rz: 0.16, n: 100 },
  { section: 'central', x: 0, y: -0.04, z: 0, rx: 0.56, ry: 0.48, rz: 0.44, n: 860 },
  { section: 'kenyon', x: -0.22, y: 0.72, z: 0.04, rx: 0.16, ry: 0.4, rz: 0.14, n: 260 },
  { section: 'kenyon', x: 0.22, y: 0.72, z: 0.04, rx: 0.16, ry: 0.4, rz: 0.14, n: 260 },
  { section: 'kenyon', x: -0.24, y: 1.05, z: 0.06, rx: 0.2, ry: 0.14, rz: 0.14, n: 120 },
  { section: 'kenyon', x: 0.24, y: 1.05, z: 0.06, rx: 0.2, ry: 0.14, rz: 0.14, n: 120 },
  { section: 'descending', x: 0, y: -0.66, z: 0.06, rx: 0.3, ry: 0.26, rz: 0.22, n: 340 },
  { section: 'descending', x: 0, y: -0.9, z: 0.1, rx: 0.16, ry: 0.14, rz: 0.12, n: 100 },
  { section: 'motor', x: -0.16, y: -1.16, z: 0.12, rx: 0.13, ry: 0.11, rz: 0.1, n: 120 },
  { section: 'motor', x: 0.16, y: -1.16, z: 0.12, rx: 0.13, ry: 0.11, rz: 0.1, n: 120 },
];
const PLACE = {
  sensory: 'optic lobes',
  kenyon: 'mushroom bodies',
  central: 'central brain',
  descending: 'descending',
  motor: 'outputs',
};
const DEFAULT_ORBIT = { azimuth: 0.48, polar: 1.08, radius: 5.4 };
const QUIET = 0.02;

const SVG_NS = 'http://www.w3.org/2000/svg';
const panels = new WeakMap();

const CSS = `
.fly-brain {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(400px, calc(100% - 24px));
  height: min(720px, calc(100% - 24px));
  padding: 12px 14px 10px;
  color: #f6efe4;
  background: rgba(14, 11, 10, 0.94);
  border: 1px solid rgba(230, 194, 122, 0.32);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  font-family: "Avenir Next", "Segoe UI", sans-serif;
  pointer-events: auto;
  overflow: hidden;
}
.fly-brain[hidden] { display: none !important; }
.fly-brain-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  border-left: 4px solid var(--fly, #e6c27a);
  padding-left: 10px;
}
.fly-brain-kicker {
  margin: 0;
  color: #e6c27a;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 11px;
}
.fly-brain h2 {
  margin: 0;
  font-family: Palatino, Georgia, serif;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.1;
}
.fly-brain-close {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid rgba(230, 194, 122, 0.35);
  background: transparent;
  color: #f6efe4;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.fly-brain-action {
  margin: 8px 0 0;
  color: #e6c27a;
  font-family: Palatino, Georgia, serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 18px;
}
.fly-brain-reason, .fly-brain-learn {
  margin: 4px 0 0;
  color: #cbbba6;
  font-size: 13px;
  line-height: 1.35;
}
.fly-brain-tabs {
  display: flex;
  gap: 6px;
  margin: 8px 0;
}
.fly-brain-tabs button {
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: #cbbba6;
  font: inherit;
  font-size: 13px;
  padding: 4px 12px;
  cursor: pointer;
}
.fly-brain-tabs button[aria-selected="true"] {
  color: #f6efe4;
  border-color: rgba(230, 194, 122, 0.55);
  background: rgba(230, 194, 122, 0.12);
}
.fly-brain-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 280px;
}
.fly-brain-pane { position: absolute; inset: 0; }
.fly-brain-pane[hidden] { display: none !important; }
.fly-brain-circuit {
  width: 100%;
  height: 100%;
  display: block;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 12px;
}
.fly-brain-empty {
  margin: 0;
  color: #cbbba6;
  font-size: 13px;
}
.fly-brain-gl {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  overflow: hidden;
  background: radial-gradient(at 50% 45%, #14161f, #0b0c10 70%);
}
.fly-brain-gl canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
  touch-action: none;
}
.fly-brain-gl canvas:active { cursor: grabbing; }
.fly-brain-caption, .fly-brain-legend {
  position: absolute;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  line-height: 14px;
  color: rgba(235, 238, 250, 0.72);
}
.fly-brain-caption { top: 8px; right: 78px; }
.fly-brain-legend { bottom: 8px; flex-wrap: wrap; }
.fly-brain-legend i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 4px;
  border-radius: 50%;
  vertical-align: 0;
}
.fly-brain-reset {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  border-radius: 999px;
  border: 1px solid rgba(235, 238, 250, 0.28);
  background: rgba(8, 10, 16, 0.72);
  color: rgba(235, 238, 250, 0.86);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  cursor: pointer;
}
`;

function ensureStyle() {
  if (document.getElementById('fly-brain-style')) return;
  const style = document.createElement('style');
  style.id = 'fly-brain-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function smooth(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function layerOf(node) {
  if (node && LAYERS.includes(node.layer)) return node.layer;
  const id = String(node?.id || '');
  const prefix = { s: 'sensory', k: 'kenyon', c: 'central', d: 'descending', m: 'motor' };
  return prefix[id[0]] || null;
}

function nodesFromActivity(activity) {
  const count = Array.isArray(activity) ? activity.length : 0;
  const sizes = count === 45 ? LAYER_SIZE : null;
  const nodes = [];
  let cursor = 0;
  if (sizes) {
    LAYERS.forEach((layer, layerIndex) => {
      const n = sizes[layerIndex];
      for (let i = 0; i < n; i++) {
        const label = layer === 'motor' && MOTOR[i] ? MOTOR[i] : `${LAYER_TITLE[layer]} ${i}`;
        nodes.push({
          id: `${layer[0]}${i}`,
          layer,
          x: layerIndex,
          y: i,
          label,
        });
        cursor++;
      }
    });
    return nodes;
  }
  const buckets = LAYERS.map(() => 0);
  const base = Math.floor(count / LAYERS.length);
  let extra = count % LAYERS.length;
  for (let i = 0; i < LAYERS.length; i++) {
    buckets[i] = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
  }
  LAYERS.forEach((layer, layerIndex) => {
    for (let i = 0; i < buckets[layerIndex]; i++) {
      nodes.push({
        id: `${layer[0]}${i}`,
        layer,
        x: layerIndex,
        y: i,
        label: layer === 'motor' && MOTOR[i] ? MOTOR[i] : `${LAYER_TITLE[layer]} ${i}`,
      });
      cursor++;
    }
  });
  return nodes.slice(0, count);
}

function modelOf(inspection) {
  const source = Array.isArray(inspection?.nodes) && inspection.nodes.length
    ? inspection.nodes
    : nodesFromActivity(inspection?.activity);
  const nodes = source.map((node, index) => {
    const layer = layerOf(node) || LAYERS[Math.min(LAYERS.length - 1, node?.x ?? 0)] || 'sensory';
    return {
      id: node?.id != null ? String(node.id) : `n${index}`,
      layer,
      x: Number.isFinite(node?.x) ? node.x : LAYERS.indexOf(layer),
      y: Number.isFinite(node?.y) ? node.y : index,
      label: node?.label != null ? String(node.label) : `${LAYER_TITLE[layer] || layer} ${index}`,
      index,
    };
  });
  const activity = nodes.map((node, index) => {
    const list = inspection?.activity;
    if (Array.isArray(list) && Number.isFinite(list[index])) return list[index];
    if (Number.isFinite(source[index]?.activity)) return source[index].activity;
    return 0;
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let edges = Array.isArray(inspection?.edges) ? inspection.edges : null;
  if (!edges || !edges.length) edges = connectLayers(nodes);
  const links = [];
  for (const edge of edges) {
    const from = byId.get(String(edge.from)) || nodes[edge.from];
    const to = byId.get(String(edge.to)) || nodes[edge.to];
    if (!from || !to || from === to) continue;
    links.push({
      from,
      to,
      sign: edge.sign < 0 ? -1 : 1,
      gain: Number.isFinite(edge.gain) ? edge.gain : 1,
    });
  }
  return { nodes, activity, links };
}

function connectLayers(nodes) {
  const groups = new Map(LAYERS.map((layer) => [layer, []]));
  for (const node of nodes) {
    if (!groups.has(node.layer)) groups.set(node.layer, []);
    groups.get(node.layer).push(node);
  }
  const order = [...LAYERS, ...[...groups.keys()].filter((layer) => !LAYERS.includes(layer))];
  const present = order.filter((layer) => groups.get(layer)?.length);
  const edges = [];
  for (let i = 0; i < present.length - 1; i++) {
    for (const from of groups.get(present[i])) {
      for (const to of groups.get(present[i + 1])) {
        edges.push({ from: from.id, to: to.id, sign: 1, gain: 1 });
      }
    }
  }
  return edges;
}

function groupsOf(nodes) {
  const buckets = new Map();
  nodes.forEach((node) => {
    if (!buckets.has(node.layer)) buckets.set(node.layer, []);
    buckets.get(node.layer).push(node);
  });
  const order = [...LAYERS, ...[...buckets.keys()].filter((layer) => !LAYERS.includes(layer))];
  return order
    .filter((layer) => buckets.get(layer)?.length)
    .map((layer) => {
      const items = buckets.get(layer).slice().sort((a, b) => a.y - b.y || a.index - b.index);
      return { layer, items };
    });
}

function actionText(decision) {
  if (!decision?.action) return 'No decision yet';
  const action = String(decision.action);
  let text = action;
  if (action === 'raise' && Number.isFinite(decision.raiseTo)) text = `raise to ${decision.raiseTo}`;
  else if (Number.isFinite(decision.amount) && decision.amount > 0) text = `${action} ${decision.amount}`;
  if (decision.allIn) text += ' · all-in';
  return text;
}

function reasonText(decision) {
  const reasons = decision?.reasons;
  if (!Array.isArray(reasons) || !reasons.length) return 'No reason recorded.';
  return String(reasons[reasons.length - 1]);
}

function learningText(learning) {
  const last = learning?.last;
  if (!last) return 'No completed hand yet.';
  if (last.summary) return String(last.summary);
  const deltas = Array.isArray(last.deltas) ? last.deltas : [];
  if (!deltas.length) return 'No numeric change recorded.';
  let top = deltas[0];
  for (const row of deltas) {
    if (Math.abs(Number(row.delta) || 0) > Math.abs(Number(top.delta) || 0)) top = row;
  }
  if (top.why) return String(top.why);
  const delta = Number(top.delta);
  return `${top.parameter} ${Number.isFinite(delta) ? delta.toFixed(4) : ''}`.trim();
}

function accentOf(inspection) {
  const hex = inspection?.colorHex;
  return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#e6c27a';
}

function svg(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function renderCircuit(rec) {
  const inspection = rec.inspection;
  const { nodes, activity, links } = modelOf(inspection);
  const empty = rec.circuitEmpty;
  const board = rec.svg;
  clear(board);
  if (!nodes.length) {
    empty.hidden = false;
    board.hidden = true;
    return;
  }
  empty.hidden = true;
  board.hidden = false;
  const width = 460;
  const height = 500;
  const groups = groupsOf(nodes);
  const left = 118;
  const right = 64;
  const top = 22;
  const bottom = 12;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const pos = new Map();
  groups.forEach((group, column) => {
    const x = groups.length === 1 ? left + innerW / 2 : left + (column / (groups.length - 1)) * innerW;
    group.items.forEach((node, row) => {
      const y = top + ((row + 0.5) / group.items.length) * innerH;
      pos.set(node.id, { x, y, node });
    });
    const title = svg('text', {
      x,
      y: 14,
      'text-anchor': 'middle',
      fill: '#b7aa9a',
      'font-size': 10,
    });
    title.textContent = LAYER_TITLE[group.layer] || group.layer;
    board.appendChild(title);
  });
  const decision = inspection?.decision;
  for (const link of links) {
    const a = pos.get(link.from.id);
    const b = pos.get(link.to.id);
    if (!a || !b) continue;
    const flow = Math.max(clamp01(activity[link.from.index]), clamp01(activity[link.to.index]));
    const bend = link.sign < 0 ? -12 : 8;
    const path = svg('path', {
      d: `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + bend} ${b.x} ${b.y}`,
      fill: 'none',
      stroke: link.sign < 0 ? `rgba(224, 112, 122, ${0.35 + 0.5 * flow})` : `rgba(230, 194, 122, ${0.28 + 0.5 * flow})`,
      'stroke-width': 0.7 + Math.min(2.2, Math.abs(link.gain) * 0.7),
    });
    board.appendChild(path);
  }
  for (const node of nodes) {
    const at = pos.get(node.id);
    if (!at) continue;
    const level = clamp01(activity[node.index]);
    const chosen = node.layer === 'motor' && decision?.action && node.label === decision.action;
    const circle = svg('circle', {
      cx: at.x,
      cy: at.y,
      r: 3.4 + level * 5.2,
      fill: heat(node.layer, level),
    });
    const title = svg('title', {});
    title.textContent = `${node.label} · ${activity[node.index].toFixed(3)}`;
    circle.appendChild(title);
    board.appendChild(circle);
    if (chosen) {
      board.appendChild(svg('circle', {
        cx: at.x,
        cy: at.y,
        r: 3.4 + level * 5.2 + 3,
        fill: 'none',
        stroke: '#e6c27a',
        'stroke-width': 1.4,
      }));
    }
    if (node.layer === 'sensory' || node.layer === 'motor') {
      const label = svg('text', {
        x: node.layer === 'sensory' ? at.x - 8 : at.x + 8,
        y: at.y + 3,
        'text-anchor': node.layer === 'sensory' ? 'end' : 'start',
        fill: '#d9cbb8',
        'font-size': 9,
      });
      label.textContent = node.label;
      board.appendChild(label);
    }
  }
  board.setAttribute('aria-label', `${inspection?.name || 'Fly'} circuit`);
}

function heat(layer, level) {
  const rest = REST[layer] || REST.central;
  const hot = HOT[layer] || HOT.central;
  const t = clamp01(level);
  const rgb = rest.map((channel, i) => Math.round(channel + (hot[i] - channel) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function fillEllipsoid(part) {
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const shells = 6;
  let weight = 0;
  const shellWeight = [];
  for (let s = 1; s <= shells; s++) {
    const w = s * s;
    shellWeight.push(w);
    weight += w;
  }
  for (let s = 1; s <= shells; s++) {
    const n = Math.max(1, Math.round(part.n * shellWeight[s - 1] / weight));
    const radius = s / shells;
    for (let i = 0; i < n && points.length < part.n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = (i + s * 3) * golden;
      points.push({
        x: part.x + Math.cos(theta) * ring * radius * part.rx,
        y: part.y + y * radius * part.ry,
        z: part.z + Math.sin(theta) * ring * radius * part.rz,
        cx: part.x,
        cy: part.y,
        cz: part.z,
        section: part.section,
        seed: points.length * 0.37,
      });
    }
  }
  return points;
}

function sectionMeans(nodes, activity) {
  const sum = {};
  const count = {};
  for (const layer of LAYERS) {
    sum[layer] = 0;
    count[layer] = 0;
  }
  nodes.forEach((node) => {
    if (!LAYERS.includes(node.layer)) return;
    sum[node.layer] += clamp01(activity[node.index]);
    count[node.layer] += 1;
  });
  const means = {};
  for (const layer of LAYERS) means[layer] = count[layer] ? sum[layer] / count[layer] : 0;
  return means;
}

function sectionSamples(nodes, activity) {
  const samples = {};
  for (const layer of LAYERS) samples[layer] = [];
  nodes.forEach((node) => {
    if (!samples[node.layer]) return;
    samples[node.layer].push(clamp01(activity[node.index]));
  });
  return samples;
}

function hotSections(means) {
  return LAYERS.filter((layer) => (means[layer] || 0) >= QUIET);
}

function replayHot(now, t0, hot, reduce) {
  if (!hot.length) return { layer: null, gain: 0, index: 0, count: 0 };
  if (reduce || hot.length === 1) return { layer: hot[0], gain: 1, index: 0, count: hot.length, all: reduce };
  const step = 820;
  const span = hot.length * step;
  const elapsed = ((now - t0) % span + span) % span;
  const index = Math.min(hot.length - 1, Math.floor(elapsed / step));
  const phase = (elapsed - index * step) / step;
  const rise = smooth(Math.min(1, phase / 0.22));
  const fall = phase < 0.78 ? 1 : 1 - smooth((phase - 0.78) / 0.22);
  return { layer: hot[index], gain: rise * fall, index, count: hot.length, all: false };
}

function mixColor(layer, amount) {
  const rest = BRAIN_REST[layer] || BRAIN_REST.central;
  const hot = BRAIN_HOT[layer] || BRAIN_HOT.central;
  const t = clamp01(amount);
  return new THREE.Color(
    (rest[0] + (hot[0] - rest[0]) * t) / 255,
    (rest[1] + (hot[1] - rest[1]) * t) / 255,
    (rest[2] + (hot[2] - rest[2]) * t) / 255,
  );
}

function placeCamera(camera, orbit) {
  const sinP = Math.sin(orbit.polar);
  camera.position.set(
    orbit.radius * sinP * Math.sin(orbit.azimuth),
    orbit.radius * Math.cos(orbit.polar),
    orbit.radius * sinP * Math.cos(orbit.azimuth),
  );
  camera.lookAt(0, 0.02, 0);
}

function resetOrbit(rec) {
  rec.orbit = { ...DEFAULT_ORBIT };
  if (rec.view) placeCamera(rec.view.camera, rec.orbit);
}

function buildView(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x0b0c10, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.setAttribute('aria-label', '3D fly brain. Drag to orbit. Scroll to zoom.');
  host.insertBefore(renderer.domElement, host.firstChild);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x9aa4be, 0.55));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.25);
  key.position.set(2.4, 3.2, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6f86ff, 0.4);
  rim.position.set(-3.2, -1.4, -2.2);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 40);
  const parts = TISSUE.map((part, index) => {
    const samples = fillEllipsoid(part);
    const count = samples.length;
    const positions = new Float32Array(count * 3);
    samples.forEach((point, i) => {
      positions[i * 3] = point.x - part.x;
      positions[i * 3 + 1] = point.y - part.y;
      positions[i * 3 + 2] = point.z - part.z;
    });
    const colors = new Float32Array(count * 3);
    const rest = mixColor(part.section, 0);
    for (let i = 0; i < count; i++) rest.toArray(colors, i * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.034,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
    }));
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 36, 28),
      new THREE.MeshStandardMaterial({
        color: rest.clone(),
        emissive: rest.clone(),
        emissiveIntensity: 0.08,
        transparent: true,
        opacity: 0.22,
        roughness: 0.62,
        metalness: 0.04,
        depthWrite: false,
      }),
    );
    mesh.scale.set(part.rx, part.ry, part.rz);
    const group = new THREE.Group();
    group.position.set(part.x, part.y, part.z);
    group.add(mesh);
    group.add(points);
    scene.add(group);
    return { section: part.section, group, mesh, points, count, seed: index * 0.7 };
  });
  return { renderer, scene, camera, parts };
}

function resizeView(rec) {
  const view = rec.view;
  if (!view) return;
  const width = rec.brainPane.clientWidth;
  const height = rec.brainPane.clientHeight;
  if (width < 2 || height < 2) return;
  view.camera.aspect = width / height;
  view.camera.updateProjectionMatrix();
  view.renderer.setSize(width, height, false);
}

function paintRegions(rec, now) {
  const { nodes, activity } = modelOf(rec.inspection);
  const means = sectionMeans(nodes, activity);
  const samples = sectionSamples(nodes, activity);
  const hot = hotSections(means);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const replay = replayHot(now, rec.brainT0 || now, hot, reduce);
  for (const part of rec.view.parts) {
    const values = samples[part.section] || [];
    const mean = means[part.section] || 0;
    const showing = replay.all ? mean >= QUIET : part.section === replay.layer;
    const gain = showing ? replay.gain : 0;
    const colors = part.points.geometry.getAttribute('color');
    const rest = BRAIN_REST[part.section] || BRAIN_REST.central;
    const hotColor = BRAIN_HOT[part.section] || BRAIN_HOT.central;
    for (let i = 0; i < part.count; i++) {
      const neuron = values.length ? values[i % values.length] : 0;
      const level = neuron >= QUIET ? neuron * gain : 0;
      const t = level;
      colors.setXYZ(
        i,
        (rest[0] + (hotColor[0] - rest[0]) * t) / 255,
        (rest[1] + (hotColor[1] - rest[1]) * t) / 255,
        (rest[2] + (hotColor[2] - rest[2]) * t) / 255,
      );
    }
    colors.needsUpdate = true;
    const glow = mean >= QUIET ? mean * gain : 0;
    part.mesh.material.color.copy(mixColor(part.section, glow));
    part.mesh.material.emissive.copy(mixColor(part.section, glow));
    part.mesh.material.emissiveIntensity = 0.08 + glow * 1.7;
    part.mesh.material.opacity = 0.2 + glow * 0.45;
    part.points.material.size = 0.03 + glow * 0.045;
    const pulse = glow > 0 && !reduce ? 1 + glow * 0.07 * Math.sin(now * 0.007 + part.seed) : 1;
    part.group.scale.setScalar(pulse);
  }
  if (!hot.length) {
    rec.step.textContent = 'Quiet';
    rec.count.textContent = '';
    rec.links.textContent = 'no section above threshold';
    return;
  }
  const active = replay.all ? hot.join(' · ') : replay.layer;
  rec.step.textContent = replay.all ? 'Settled' : (LAYER_TITLE[replay.layer] || '');
  rec.count.textContent = replay.all
    ? `${hot.length} sections lit`
    : `step ${replay.index + 1} / ${replay.count}`;
  rec.links.textContent = replay.all ? active : (PLACE[replay.layer] || '');
}

function renderView(rec, now) {
  if (!rec.view) rec.view = buildView(rec.brainPane);
  resizeView(rec);
  placeCamera(rec.view.camera, rec.orbit);
  paintRegions(rec, now);
  rec.view.renderer.render(rec.view.scene, rec.view.camera);
}

function disposeView(rec) {
  const view = rec.view;
  if (!view) return;
  view.renderer.dispose();
  view.renderer.domElement.remove();
  for (const part of view.parts) {
    part.points.geometry.dispose();
    part.points.material.dispose();
    part.mesh.geometry.dispose();
    part.mesh.material.dispose();
  }
  rec.view = null;
}

function paintChrome(rec) {
  const inspection = rec.inspection || {};
  rec.root.style.setProperty('--fly', accentOf(inspection));
  rec.style.textContent = inspection.playstyle?.label || inspection.style || '';
  rec.name.textContent = inspection.name || 'Fly';
  rec.action.textContent = actionText(inspection.decision);
  rec.reason.textContent = reasonText(inspection.decision);
  rec.learn.textContent = learningText(inspection.learning);
}

function activityKey(inspection) {
  let key = `${inspection?.id || inspection?.name || ''}|`;
  const list = inspection?.activity;
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) key += `${Number.isFinite(list[i]) ? list[i] : 0},`;
    return key;
  }
  const nodes = inspection?.nodes;
  if (Array.isArray(nodes)) {
    for (const node of nodes) key += `${Number.isFinite(node?.activity) ? node.activity : 0},`;
  }
  return key;
}

function selectTab(rec, tab) {
  rec.tab = tab;
  rec.circuitPane.hidden = tab !== 'circuit';
  rec.brainPane.hidden = tab !== 'brain';
  rec.tabCircuit.setAttribute('aria-selected', tab === 'circuit' ? 'true' : 'false');
  rec.tabBrain.setAttribute('aria-selected', tab === 'brain' ? 'true' : 'false');
  if (tab === 'brain' && !rec.root.hidden) startLoop(rec);
  else stopLoop(rec);
}

function startLoop(rec) {
  if (rec.raf) return;
  if (!rec.brainT0) rec.brainT0 = performance.now();
  const tick = (now) => {
    if (rec.root.hidden || rec.tab !== 'brain') {
      rec.raf = 0;
      return;
    }
    renderView(rec, now);
    rec.raf = requestAnimationFrame(tick);
  };
  rec.raf = requestAnimationFrame(tick);
}

function stopLoop(rec) {
  if (!rec.raf) return;
  cancelAnimationFrame(rec.raf);
  rec.raf = 0;
}

export function createBrainPanel(container) {
  if (!container) throw new Error('createBrainPanel needs a container');
  ensureStyle();
  const computed = getComputedStyle(container);
  if (computed.position === 'static') container.style.position = 'relative';

  const root = document.createElement('section');
  root.className = 'fly-brain';
  root.hidden = true;
  root.setAttribute('aria-label', 'Fly brain');

  const head = document.createElement('div');
  head.className = 'fly-brain-head';
  const titles = document.createElement('div');
  const style = document.createElement('p');
  style.className = 'fly-brain-kicker';
  const name = document.createElement('h2');
  titles.append(style, name);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'fly-brain-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  head.append(titles, close);

  const action = document.createElement('p');
  action.className = 'fly-brain-action';
  const reason = document.createElement('p');
  reason.className = 'fly-brain-reason';

  const tabs = document.createElement('div');
  tabs.className = 'fly-brain-tabs';
  tabs.setAttribute('role', 'tablist');
  const tabCircuit = document.createElement('button');
  tabCircuit.type = 'button';
  tabCircuit.textContent = 'Circuit';
  tabCircuit.setAttribute('role', 'tab');
  tabCircuit.setAttribute('aria-selected', 'true');
  const tabBrain = document.createElement('button');
  tabBrain.type = 'button';
  tabBrain.textContent = 'Brain';
  tabBrain.setAttribute('role', 'tab');
  tabBrain.setAttribute('aria-selected', 'false');
  tabs.append(tabCircuit, tabBrain);

  const stage = document.createElement('div');
  stage.className = 'fly-brain-stage';
  const circuitPane = document.createElement('div');
  circuitPane.className = 'fly-brain-pane';
  const circuitEmpty = document.createElement('p');
  circuitEmpty.className = 'fly-brain-empty';
  circuitEmpty.hidden = true;
  circuitEmpty.textContent = 'No circuit on this fly.';
  const board = svg('svg', {
    viewBox: '0 0 460 500',
    class: 'fly-brain-circuit',
    role: 'img',
  });
  circuitPane.append(circuitEmpty, board);

  const brainPane = document.createElement('div');
  brainPane.className = 'fly-brain-pane fly-brain-gl';
  brainPane.hidden = true;
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'fly-brain-reset';
  reset.textContent = 'Reset';
  const caption = document.createElement('div');
  caption.className = 'fly-brain-caption';
  const step = document.createElement('span');
  const count = document.createElement('span');
  caption.append(step, count);
  const legend = document.createElement('div');
  legend.className = 'fly-brain-legend';
  for (const layer of LAYERS) {
    const item = document.createElement('span');
    const swatch = document.createElement('i');
    const hot = BRAIN_HOT[layer];
    swatch.style.background = `rgb(${hot[0]}, ${hot[1]}, ${hot[2]})`;
    item.append(swatch, document.createTextNode(LAYER_TITLE[layer]));
    legend.appendChild(item);
  }
  const links = document.createElement('span');
  legend.appendChild(links);
  brainPane.append(reset, caption, legend);
  stage.append(circuitPane, brainPane);

  const learn = document.createElement('p');
  learn.className = 'fly-brain-learn';

  root.append(head, action, reason, tabs, stage, learn);
  container.appendChild(root);

  const rec = {
    root,
    style,
    name,
    action,
    reason,
    learn,
    tabCircuit,
    tabBrain,
    circuitPane,
    circuitEmpty,
    svg: board,
    brainPane,
    step,
    count,
    links,
    inspection: null,
    tab: 'circuit',
    raf: 0,
    brainT0: 0,
    orbit: { ...DEFAULT_ORBIT },
    view: null,
    drag: null,
  };
  panels.set(root, rec);

  close.addEventListener('click', () => hideBrain(root));
  tabCircuit.addEventListener('click', () => selectTab(rec, 'circuit'));
  tabBrain.addEventListener('click', () => selectTab(rec, 'brain'));
  reset.addEventListener('click', () => resetOrbit(rec));
  brainPane.addEventListener('pointerdown', (event) => {
    if (event.target === reset) return;
    rec.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    brainPane.setPointerCapture(event.pointerId);
  });
  brainPane.addEventListener('pointermove', (event) => {
    if (!rec.drag || rec.drag.id !== event.pointerId) return;
    rec.orbit.azimuth -= (event.clientX - rec.drag.x) * 0.007;
    rec.orbit.polar = Math.max(0.18, Math.min(Math.PI - 0.18, rec.orbit.polar + (event.clientY - rec.drag.y) * 0.005));
    rec.drag.x = event.clientX;
    rec.drag.y = event.clientY;
  });
  const endDrag = () => { rec.drag = null; };
  brainPane.addEventListener('pointerup', endDrag);
  brainPane.addEventListener('pointercancel', endDrag);
  brainPane.addEventListener('wheel', (event) => {
    if (rec.tab !== 'brain') return;
    event.preventDefault();
    rec.orbit.radius = Math.max(2.2, Math.min(10, rec.orbit.radius * Math.exp(event.deltaY * 0.0011)));
  }, { passive: false });

  return root;
}

export function showBrain(panel, inspection) {
  const rec = panels.get(panel);
  if (!rec) return;
  const key = activityKey(inspection);
  if (key !== rec.activityKey) {
    rec.activityKey = key;
    rec.brainT0 = performance.now();
  }
  rec.inspection = inspection || null;
  rec.root.hidden = false;
  paintChrome(rec);
  renderCircuit(rec);
  if (rec.tab === 'brain') startLoop(rec);
}

export function hideBrain(panel) {
  const rec = panels.get(panel);
  if (!rec) return;
  rec.root.hidden = true;
  stopLoop(rec);
  disposeView(rec);
}
