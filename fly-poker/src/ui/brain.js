/**
 * Fly brain overlay.
 * Circuit: layered schematic lit by inspection.activity.
 * Brain: a dense Three.js point cloud. Layered optic lobes, an irregular
 * central mass, mushroom-body horns, a descending cord, motor tips.
 * One section lights at a time, in order, from inspection.activity.
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

const CLOUD = [72, 86, 148];
const BRAIN_HOT = {
  sensory: [179, 154, 255],
  kenyon: [210, 170, 255],
  central: [255, 163, 77],
  descending: [255, 115, 71],
  motor: [255, 214, 102],
};
const FIRE = {
  sensory: BRAIN_HOT.sensory,
  visual: [102, 250, 240],
  kenyon: BRAIN_HOT.kenyon,
  central: BRAIN_HOT.central,
  descending: BRAIN_HOT.descending,
  motor: BRAIN_HOT.motor,
};
const PLACE = {
  sensory: 'optic lobes',
  kenyon: 'mushroom bodies',
  central: 'central brain',
  descending: 'descending',
  motor: 'outputs',
};
const DEFAULT_ORBIT = { azimuth: 0.62, polar: 1.15, radius: 3.35 };
const QUIET = 0.02;
const STEP_MS = 1500;

const SVG_NS = 'http://www.w3.org/2000/svg';
const panels = new WeakMap();

const CSS = `
.fly-brain {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 5;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: min(640px, calc(100vh - 200px));
  min-height: 420px;
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
  background: #07080d;
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

function unit(i, salt) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function pushPoint(out, x, y, z, section, tint) {
  out.push({ x, y, z, section, tint });
}

function opticLobe(sign, out) {
  const layers = [
    { lateral: 0.62, ry: 0.44, rz: 0.32, thick: 0.05, n: 720, tint: 'sensory' },
    { lateral: 0.86, ry: 0.58, rz: 0.4, thick: 0.06, n: 1100, tint: 'sensory' },
    { lateral: 1.12, ry: 0.64, rz: 0.44, thick: 0.07, n: 1400, tint: 'sensory' },
    { lateral: 1.36, ry: 0.48, rz: 0.3, thick: 0.04, n: 680, tint: 'visual' },
  ];
  let cursor = sign < 0 ? 8000 : 32000;
  for (const layer of layers) {
    for (let i = 0; i < layer.n; i++) {
      cursor += 1;
      const ang = unit(cursor, 1) * Math.PI * 2;
      const shellPick = unit(cursor, 2);
      const shell = shellPick > 0.3 ? 0.84 + unit(cursor, 3) * 0.16 : 0.18 + unit(cursor, 4) * 0.55;
      const r = Math.sqrt(unit(cursor, 5)) * shell;
      let y = Math.sin(ang) * r * layer.ry;
      let z = Math.cos(ang) * r * layer.rz;
      z -= r * r * 0.2;
      y -= layer.lateral * 0.045;
      y *= 1 + (unit(cursor, 6) - 0.5) * 0.1;
      z *= 1 + (unit(cursor, 7) - 0.5) * 0.08;
      const x = sign * (layer.lateral + (unit(cursor, 8) - 0.5) * layer.thick * 2);
      pushPoint(out, x, y, z, 'sensory', layer.tint);
    }
  }
  for (let i = 0; i < 240; i++) {
    cursor += 1;
    const t = i / 240;
    const x = sign * (0.34 + t * 0.28);
    const y = (unit(cursor, 9) - 0.5) * 0.12 * (1.05 - t);
    const z = (unit(cursor, 10) - 0.5) * 0.08;
    pushPoint(out, x, y, z, 'sensory', 'sensory');
  }
}

function centralMass(out) {
  const n = 3600;
  const golden = Math.PI * (3 - Math.sqrt(5));
  let kept = 0;
  let i = 0;
  while (kept < n && i < n * 4) {
    const y = 1 - (2 * (i + 0.5)) / (n * 1.4);
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * golden;
    const radial = unit(i, 20) > 0.32 ? 0.88 + unit(i, 21) * 0.12 : unit(i, 22) ** 0.5;
    let x = Math.cos(theta) * ring * radial;
    let yy = y * radial;
    let z = Math.sin(theta) * ring * radial;
    const lump = 1
      + 0.09 * Math.sin(x * 7.4 + 1.7) * Math.cos(yy * 6.1)
      + 0.05 * Math.sin(z * 9.2 + yy * 3);
    x *= 0.4 * lump;
    yy *= 0.36 * lump;
    z *= 0.32 * lump;
    yy -= 0.02;
    const hole = Math.hypot(x / 0.1, (yy + 0.06) / 0.08, (z - 0.04) / 0.08);
    i += 1;
    if (hole < 1) continue;
    pushPoint(out, x, yy, z, 'central', 'central');
    kept += 1;
  }
  for (let k = 0; k < 480; k++) {
    const a = unit(k, 30) * Math.PI * 2;
    const r = Math.sqrt(unit(k, 31)) * 0.15;
    pushPoint(
      out,
      Math.cos(a) * r * 1.15,
      -0.34 + Math.sin(a) * r * 0.65,
      0.02 + (unit(k, 32) - 0.5) * 0.1,
      'central',
      'central',
    );
  }
}

function mushroomBodies(out) {
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 460; i++) {
      const t = (i + 0.5) / 460;
      const y = 0.1 + t * 0.58;
      const x = sign * (0.06 + t * 0.11);
      const z = 0.02 + Math.sin(t * 2.2) * 0.05;
      const a = unit(i, 40 + sign) * Math.PI * 2;
      const rad = Math.sqrt(unit(i, 41 + sign)) * (0.05 * (1 - t * 0.2));
      pushPoint(
        out,
        x + Math.cos(a) * rad,
        y + (unit(i, 42 + sign) - 0.5) * rad * 0.35,
        z + Math.sin(a) * rad * 0.7,
        'kenyon',
        'kenyon',
      );
    }
    for (let i = 0; i < 280; i++) {
      const t = (i + 0.5) / 280;
      const a = unit(i, 51 + sign) * Math.PI * 2;
      const rad = Math.sqrt(unit(i, 52 + sign)) * 0.038;
      pushPoint(
        out,
        sign * (0.16 * (1 - t) + 0.02) + Math.cos(a) * rad,
        0.05 + Math.sin(a) * rad * 0.55,
        0.05 + t * 0.26,
        'kenyon',
        'kenyon',
      );
    }
    for (let i = 0; i < 200; i++) {
      const a = unit(i, 60 + sign) * Math.PI * 2;
      const r = 0.045 + Math.sqrt(unit(i, 61 + sign)) * 0.06;
      pushPoint(
        out,
        sign * 0.2 + Math.cos(a) * r,
        0.26 + Math.sin(a) * r * 0.5,
        -0.18 + (unit(i, 62 + sign) - 0.4) * 0.07,
        'kenyon',
        'kenyon',
      );
    }
  }
}

function descendingTract(out) {
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 420; i++) {
      const t = (i + 0.5) / 420;
      const a = unit(i, 70 + sign) * Math.PI * 2;
      const rad = Math.sqrt(unit(i, 71 + sign)) * (0.065 * (1 - t * 0.5));
      pushPoint(
        out,
        sign * (0.045 + t * 0.02) + Math.cos(a) * rad,
        -0.4 - t * 0.55,
        -0.02 - t * 0.1 + Math.sin(a) * rad,
        'descending',
        'descending',
      );
    }
  }
}

function motorTips(out) {
  const tips = [
    [-0.14, -1.02, 0.02],
    [-0.05, -1.08, 0.07],
    [0.05, -1.1, 0.0],
    [0.13, -1.04, -0.05],
    [0.0, -0.98, -0.08],
  ];
  tips.forEach((tip, index) => {
    for (let i = 0; i < 100; i++) {
      const a = unit(i, 80 + index) * Math.PI * 2;
      const r = Math.sqrt(unit(i, 81 + index)) * 0.042;
      pushPoint(
        out,
        tip[0] + Math.cos(a) * r,
        tip[1] + (unit(i, 82 + index) - 0.5) * 0.035,
        tip[2] + Math.sin(a) * r,
        'motor',
        'motor',
      );
    }
  });
}

function buildCloud() {
  const out = [];
  opticLobe(-1, out);
  opticLobe(1, out);
  centralMass(out);
  mushroomBodies(out);
  descendingTract(out);
  motorTips(out);
  return out;
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

function replayHot(now, t0, hot) {
  if (!hot.length) return { layer: null, gain: 0, index: 0, count: 0 };
  if (hot.length === 1) return { layer: hot[0], gain: 1, index: 0, count: 1 };
  const span = hot.length * STEP_MS;
  const elapsed = ((now - t0) % span + span) % span;
  const index = Math.min(hot.length - 1, Math.floor(elapsed / STEP_MS));
  const phase = (elapsed - index * STEP_MS) / STEP_MS;
  const rise = smooth(Math.min(1, phase / 0.12));
  const fall = phase < 0.84 ? 1 : 1 - smooth((phase - 0.84) / 0.16);
  return { layer: hot[index], gain: rise * fall, index, count: hot.length };
}

function placeCamera(camera, orbit) {
  const sinP = Math.sin(orbit.polar);
  camera.position.set(
    orbit.radius * sinP * Math.sin(orbit.azimuth),
    orbit.radius * Math.cos(orbit.polar),
    orbit.radius * sinP * Math.cos(orbit.azimuth),
  );
  camera.lookAt(0, -0.04, 0);
}

function resetOrbit(rec) {
  rec.orbit = { ...DEFAULT_ORBIT };
  if (rec.view) placeCamera(rec.view.camera, rec.orbit);
}

const POINT_VERT = `
attribute vec3 color;
attribute float glow;
varying vec3 vColor;
varying float vGlow;
uniform float uSize;
void main() {
  vColor = color;
  vGlow = glow;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(uSize * (0.8 + glow) * (3.2 / max(0.35, -mv.z)), 1.0, 4.2);
  gl_Position = projectionMatrix * mv;
}
`;

const POINT_FRAG = `
varying vec3 vColor;
varying float vGlow;
void main() {
  vec2 q = gl_PointCoord - vec2(0.5);
  float d = dot(q, q);
  if (d > 0.25) discard;
  float alpha = smoothstep(0.25, 0.02, d) * (0.5 + vGlow * 0.5);
  gl_FragColor = vec4(vColor, alpha);
}
`;

function buildView(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x07080d, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.setAttribute('aria-label', '3D fly brain. Drag to orbit. Scroll to zoom.');
  host.insertBefore(renderer.domElement, host.firstChild);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, 0.05, 40);
  const samples = buildCloud();
  const count = samples.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const glow = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const point = samples[i];
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
    colors[i * 3] = CLOUD[0] / 255;
    colors[i * 3 + 1] = CLOUD[1] / 255;
    colors[i * 3 + 2] = CLOUD[2] / 255;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 2.05 } },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return { renderer, scene, camera, points, samples, count };
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
  const replay = replayHot(now, rec.brainT0 || now, hot);
  const view = rec.view;
  const colors = view.points.geometry.getAttribute('color');
  const glowAttr = view.points.geometry.getAttribute('glow');
  const cursor = {};
  for (const layer of LAYERS) cursor[layer] = 0;
  for (let i = 0; i < view.count; i++) {
    const point = view.samples[i];
    const values = samples[point.section] || [];
    const neuron = values.length ? values[cursor[point.section] % values.length] : 0;
    cursor[point.section] += 1;
    const gain = point.section === replay.layer ? replay.gain : 0;
    const level = neuron >= QUIET ? neuron * gain : 0;
    const hotColor = FIRE[point.tint] || FIRE[point.section] || FIRE.central;
    colors.setXYZ(
      i,
      (CLOUD[0] + (hotColor[0] - CLOUD[0]) * level) / 255,
      (CLOUD[1] + (hotColor[1] - CLOUD[1]) * level) / 255,
      (CLOUD[2] + (hotColor[2] - CLOUD[2]) * level) / 255,
    );
    glowAttr.setX(i, level);
  }
  colors.needsUpdate = true;
  glowAttr.needsUpdate = true;
  if (!hot.length) {
    rec.step.textContent = 'Quiet';
    rec.count.textContent = '';
    rec.links.textContent = 'no section above threshold';
    return;
  }
  rec.step.textContent = LAYER_TITLE[replay.layer] || '';
  rec.count.textContent = `step ${replay.index + 1} / ${replay.count}`;
  rec.links.textContent = PLACE[replay.layer] || '';
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
  view.points.geometry.dispose();
  view.points.material.dispose();
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
    rec.orbit.radius = Math.max(1.7, Math.min(8, rec.orbit.radius * Math.exp(event.deltaY * 0.0011)));
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
