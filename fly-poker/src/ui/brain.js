/**
 * Fly brain overlay.
 * Circuit, Brain, and Learning fill the bottom sheet.
 * The 3D brain is a fruit fly: two large curved optic-lobe sheets, a narrower
 * central brain, mushroom-body horns, and small ventral antennal lobes.
 * Lines correspond to the model's 45-unit graph. The anatomical rendering is
 * illustrative; it is not a spatial map of those units. Rest colors stay bright.
 * Active sections flare once, then playback holds on the executed action.
 * Drag orbits, right-drag or shift-drag pans, the wheel, +/− or a double-click zooms, Reset restores the camera.
 */

import * as THREE from 'three';
import { FLIES } from '../brains/styles.js';

const LAYERS = ['sensory', 'kenyon', 'central', 'descending', 'motor'];
const SECTION_ID = { sensory: 0, kenyon: 1, central: 2, descending: 3, motor: 4 };
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

const REGION = {
  sensory: [0, 214, 224],
  kenyon: [236, 42, 196],
  central: [255, 168, 28],
  descending: [36, 214, 92],
  motor: [214, 230, 255],
};
const PLACE = {
  sensory: 'optic lobes',
  kenyon: 'mushroom bodies',
  central: 'central brain',
  descending: 'descending',
  motor: 'outputs',
};
const PART_LINE = {
  sensory: 'Optic lobes are taking in the cards.',
  kenyon: 'Mushroom bodies are recalling the table.',
  central: 'The central brain is weighing the action.',
  descending: 'The descending path is choosing.',
  motor: 'Motor neurons are acting.',
};
const DEFAULT_ORBIT = { azimuth: 0, polar: Math.PI / 2, radius: 4.6, panX: 0, panY: 0 };
const BRAIN_SCALE = 1;
const NARRATE_URL = '/api/narrate';
const QUIET = 0.02;
const STEP_MS = 1500;

const SVG_NS = 'http://www.w3.org/2000/svg';
const panels = new WeakMap();

const CSS = `
#brain {
  position: fixed !important;
  inset: 0 !important;
  width: auto !important;
  height: auto !important;
  max-height: none !important;
  z-index: 40 !important;
  pointer-events: none !important;
  background: transparent !important;
}
.fly-brain {
  position: absolute;
  left: 8px;
  right: 8px;
  top: auto;
  bottom: 148px;
  z-index: 1;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: auto;
  height: min(460px, calc(100vh - 168px));
  min-height: 280px;
  max-height: min(460px, calc(100vh - 168px));
  padding: 16px 18px 14px;
  transform: translateY(110%);
  transition: transform 300ms ease;
  will-change: transform;
  color: #f6efe4;
  background: rgba(14, 11, 10, 0.94);
  border: 1px solid rgba(230, 194, 122, 0.32);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  font-family: "Avenir Next", "Segoe UI", sans-serif;
  pointer-events: auto;
  overflow: hidden;
}
.fly-brain.is-open { transform: translateY(0); }
.fly-brain[hidden] { display: none !important; }
@media (prefers-reduced-motion: reduce) {
  .fly-brain { transition: none; }
}
.fly-brain-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.fly-brain-badge {
  width: 44px;
  height: 44px;
  flex: none;
  display: block;
}
.fly-brain-who { flex: 1; min-width: 0; }
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
  min-height: 0;
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 38%);
  grid-template-rows: minmax(0, 1fr);
  border-radius: 12px;
  overflow: hidden;
  background: #07080d;
}
.fly-brain-view { position: relative; min-width: 0; min-height: 140px; }
.fly-brain-live {
  position: relative;
  z-index: 2;
  overflow: auto;
  overscroll-behavior: contain;
  min-height: 0;
  max-height: 100%;
  padding: 12px 16px 14px;
  background: rgba(10, 12, 16, 0.94);
  border-left: 1px solid rgba(235, 238, 250, 0.14);
}
.fly-brain-live > .fly-brain-part:first-child {
  margin: 0 0 14px;
  color: #b9ad9c;
  font-size: 13px;
  font-style: italic;
}
.fly-brain-live .fly-brain-adapt:not(:empty) {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-left: 3px solid var(--fly, #e6c27a);
  border-radius: 0 8px 8px 0;
  background: rgba(230, 194, 122, 0.08);
  font-size: 16px;
}
.fly-brain-live .fly-brain-growth { margin: 0 0 16px; }
.fly-brain-live .fly-brain-growth li {
  position: relative;
  margin: 0;
  padding: 5px 0 5px 14px;
  border-top: 1px solid rgba(235, 238, 250, 0.08);
}
.fly-brain-live .fly-brain-growth li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 12px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--fly, #e6c27a);
}
.fly-brain-now-pane .fly-brain-thought { margin-bottom: 4px; }
.fly-brain-now-pane p:empty { display: none; }
.fly-brain-now-pane .fly-brain-path { color: #d9cbb8; font-family: inherit; font-size: 14px; font-style: italic; }
@media (max-width: 760px) {
  .fly-brain-gl { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(140px, 1fr) minmax(0, 40%); }
  .fly-brain-live { border-left: 0; border-top: 1px solid rgba(235, 238, 250, 0.14); }
}
.fly-brain-kicker.live { margin-bottom: 6px; }
.fly-brain-thought {
  margin: 0;
  font-family: Palatino, Georgia, serif;
  font-size: 18px;
  line-height: 1.35;
  color: #f7f1e8;
}
.fly-brain-part {
  margin: 12px 0 0;
  color: #d9cbb8;
  font-size: 14px;
  line-height: 1.4;
}
.fly-brain-growth {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  color: #d9cbb8;
  font-size: 13px;
  line-height: 1.4;
}
.fly-brain-growth li { margin: 0 0 6px; }
.fly-brain-adapt {
  margin: 8px 0 0;
  color: #f6efe4;
  font-family: Palatino, Georgia, serif;
  font-size: 15px;
  line-height: 1.4;
}
.fly-brain-path {
  margin: 12px 0 0;
  color: #f6efe4;
  font-family: Palatino, Georgia, serif;
  font-size: 16px;
  line-height: 1.4;
}
.fly-brain-learn-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px 14px 10px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 12px;
}
.fly-brain-radar {
  display: block;
  width: 100%;
  flex: 0 0 300px;
  height: 300px;
}
.fly-brain-learn-pane .fly-brain-history { flex: 0 0 auto; }
.fly-insights {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  align-content: start;
  gap: 10px 18px;
}
.fly-insight { min-width: 0; padding: 8px 0 10px; border-top: 1px solid rgba(230, 194, 122, 0.14); }
.fly-insight[hidden] { display: none; }
.fly-insight-chart { display: block; width: 100%; height: 80px; }
.fly-insight-chart.tall { height: 110px; }
.fly-insight-chart.short { height: 28px; }
.fly-insight .fly-brain-radar { flex: none; height: 200px; }
.fly-insight-note { margin: 6px 0 0; color: #d9cbb8; font-size: 13px; line-height: 1.4; }
.fly-brain-history {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.fly-brain-history li {
  margin: 0 0 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(230, 194, 122, 0.18);
  color: #d9cbb8;
  font-size: 13px;
  line-height: 1.45;
}
.fly-brain-history p { margin: 0 0 4px; }
.fly-brain-gl canvas {
  position: absolute;
  inset: 0;
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
.fly-brain-caption { top: 8px; right: 150px; }
.fly-brain-legend { bottom: 8px; flex-wrap: wrap; }
.fly-brain-legend i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 4px;
  border-radius: 50%;
  vertical-align: 0;
}
.fly-brain-tools {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: flex;
  gap: 4px;
}
.fly-brain-reset {
  min-width: 26px;
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
  let style = document.getElementById('fly-brain-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'fly-brain-style';
    document.head.appendChild(style);
  }
  style.textContent = CSS;
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
  const host = board.parentElement;
  const box = host?.getBoundingClientRect();
  const width = Math.round(box?.width || 0) >= 8 ? Math.round(box.width) : 1200;
  const height = Math.round(box?.height || 0) >= 8 ? Math.round(box.height) : 320;
  board.setAttribute('viewBox', `0 0 ${width} ${height}`);
  board.setAttribute('preserveAspectRatio', 'none');
  const groups = groupsOf(nodes);
  const left = Math.max(108, Math.min(190, width * 0.16));
  const right = Math.max(72, Math.min(130, width * 0.1));
  const top = Math.max(22, height * 0.08);
  const bottom = Math.max(12, height * 0.05);
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

function pushPoint(out, x, y, z, section, tint, neuron) {
  const point = { x, y, z, section, tint };
  if (Number.isFinite(neuron)) point.neuron = neuron;
  out.push(point);
}

/** Neck connective outputs, just below the central brain. */
const MOTOR_TIPS = [
  [-0.16, -0.58, 0.06],
  [-0.08, -0.62, 0.08],
  [0, -0.64, 0.09],
  [0.08, -0.62, 0.08],
  [0.16, -0.58, 0.06],
];

/**
 * Drosophila proportions: the whole brain is about 2.4x the central brain's width.
 * Each optic lobe is four nested, curved neuropils pressed against the central brain:
 * lobula plate and lobula innermost, the large medulla, then the thin lamina outside.
 */
const OPTIC_SHEETS = [
  { lateral: 0.42, thick: 0.05, ry: 0.24, rz: 0.13, bow: 0.03, n: 700 },
  { lateral: 0.5, thick: 0.06, ry: 0.3, rz: 0.17, bow: 0.04, n: 1000 },
  { lateral: 0.64, thick: 0.1, ry: 0.4, rz: 0.22, bow: 0.06, n: 2200 },
  { lateral: 0.8, thick: 0.03, ry: 0.38, rz: 0.2, bow: 0.05, n: 1000 },
];

function opticLobe(sign, out) {
  let cursor = sign < 0 ? 8000 : 32000;
  for (const sheet of OPTIC_SHEETS) {
    for (let i = 0; i < sheet.n; i++) {
      cursor += 1;
      const ang = unit(cursor, 1) * Math.PI * 2;
      const rad = Math.sqrt(unit(cursor, 2));
      const y = Math.sin(ang) * rad * sheet.ry;
      const z = Math.cos(ang) * rad * sheet.rz;
      const crown = 1 - rad * rad;
      const x = sign * (sheet.lateral + crown * sheet.bow + (unit(cursor, 3) - 0.5) * sheet.thick);
      pushPoint(out, x, y + 0.04, z - rad * rad * 0.04, 'sensory', 'sensory');
    }
  }
}

function antennalLobes(out) {
  for (const sign of [-1, 1]) {
    const ox = sign * 0.11;
    const oy = -0.22;
    const oz = 0.2;
    for (let i = 0; i < 240; i++) {
      const ang = unit(i, 90 + sign) * Math.PI * 2;
      const rad = Math.cbrt(unit(i, 91 + sign));
      const zz = (unit(i, 92 + sign) * 2 - 1) * rad;
      const ring = Math.sqrt(Math.max(0, rad * rad - zz * zz));
      pushPoint(
        out,
        ox + Math.cos(ang) * ring * 0.09,
        oy + zz * 0.08,
        oz + Math.sin(ang) * ring * 0.08,
        'sensory',
        'sensory',
      );
    }
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
    x *= 0.36 * lump;
    yy *= 0.38 * lump;
    z *= 0.24 * lump;
    yy += 0.04;
    i += 1;
    pushPoint(out, x, yy, z, 'central', 'central');
    kept += 1;
  }
}

/** Stalk and vertical lobe take PPL1 (punishment) dopamine. The horizontal lobe takes PAM (reward) dopamine. */
function mushroomBodies(out) {
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 640; i++) {
      const t = (i + 0.5) / 640;
      const hook = Math.sin(t * Math.PI * 0.92);
      const y = 0.06 + hook * 0.26;
      const x = sign * (0.05 + t * 0.16 + Math.sin(t * 2.4) * 0.02);
      const z = 0.14 - t * 0.26;
      const a = unit(i, 40 + sign) * Math.PI * 2;
      const rad = Math.sqrt(unit(i, 41 + sign)) * (0.03 * (1 - t * 0.4));
      pushPoint(
        out,
        x + Math.cos(a) * rad,
        y + (unit(i, 42 + sign) - 0.5) * rad * 0.35,
        z + Math.sin(a) * rad,
        'kenyon',
        'punish',
      );
    }
    for (let i = 0; i < 220; i++) {
      const t = (i + 0.5) / 220;
      const y = 0.08 + Math.sin(t * Math.PI) * 0.06;
      const x = sign * (0.14 * (1 - t) + 0.02);
      const z = 0.14 + t * 0.02;
      const a = unit(i, 51 + sign) * Math.PI * 2;
      const rad = Math.sqrt(unit(i, 52 + sign)) * 0.025;
      pushPoint(out, x + Math.cos(a) * rad, y, z + Math.sin(a) * rad * 0.7, 'kenyon', 'reward');
    }
    for (let i = 0; i < 180; i++) {
      const a = unit(i, 60 + sign) * Math.PI * 2;
      const r = 0.02 + Math.sqrt(unit(i, 61 + sign)) * 0.06;
      pushPoint(
        out,
        sign * 0.2 + Math.cos(a) * r,
        0.32 + Math.sin(a) * r * 0.45,
        -0.13 + (unit(i, 62 + sign) - 0.5) * 0.05,
        'kenyon',
        'kenyon',
      );
    }
  }
}

function descendingTract(out) {
  for (let i = 0; i < 480; i++) {
    const t = (i + 0.5) / 480;
    const a = unit(i, 70) * Math.PI * 2;
    const rad = Math.sqrt(unit(i, 71)) * (0.04 * (1 - t * 0.25));
    const side = i % 2 === 0 ? -1 : 1;
    pushPoint(
      out,
      side * 0.04 + Math.cos(a) * rad,
      -0.26 - t * 0.3,
      0.02 + Math.sin(a) * rad * 0.55,
      'descending',
      'descending',
    );
  }
}

function motorTips(out) {
  MOTOR_TIPS.forEach((tip, index) => {
    for (let i = 0; i < 90; i++) {
      const a = unit(i, 80 + index) * Math.PI * 2;
      const r = Math.sqrt(unit(i, 81 + index)) * 0.03;
      pushPoint(
        out,
        tip[0] + Math.cos(a) * r,
        tip[1] + (unit(i, 82 + index) - 0.5) * 0.028,
        tip[2] + Math.sin(a) * r * 0.7,
        'motor',
        'motor',
        index,
      );
    }
  });
}

function buildCloud() {
  const out = [];
  opticLobe(-1, out);
  opticLobe(1, out);
  antennalLobes(out);
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

function playbackSections(means, executed) {
  const hot = hotSections(means);
  if (!executed) return hot;
  const steps = hot.filter((layer) => layer !== 'motor');
  steps.push('motor');
  return steps;
}

function replayHot(now, t0, hot, slot) {
  // One pass, then hold. The last step is the executed action when motor fired. Never wraps.
  const out = slot || { layer: null, gain: 0, index: 0, count: 0, resting: true };
  if (!hot || !hot.length) {
    out.layer = null;
    out.gain = 0;
    out.index = 0;
    out.count = 0;
    out.resting = true;
    return out;
  }
  if (hot.length === 1) {
    out.layer = hot[0];
    out.gain = 1;
    out.index = 0;
    out.count = 1;
    out.resting = true;
    return out;
  }
  const elapsed = Math.max(0, now - t0);
  const last = hot.length - 1;
  const index = Math.min(last, Math.floor(elapsed / STEP_MS));
  const phase = (elapsed - index * STEP_MS) / STEP_MS;
  const rise = smooth(Math.min(1, phase / 0.12));
  out.index = index;
  out.count = hot.length;
  if (index === last) {
    out.layer = hot[last];
    out.gain = rise;
    out.resting = phase >= 0.12;
    return out;
  }
  const fall = phase < 0.84 ? 1 : 1 - smooth((phase - 0.84) / 0.16);
  out.layer = hot[index];
  out.gain = rise * fall;
  out.resting = false;
  return out;
}

const PLAIN_PART = {
  sensory: 'its eyes',
  kenyon: 'its memory',
  central: 'its decision center',
  descending: 'its nerve cord',
  motor: 'the muscles',
};

function firedPath(inspection) {
  const { nodes, activity } = modelOf(inspection);
  const hot = hotSections(sectionMeans(nodes, activity)).filter((layer) => layer !== 'motor');
  const action = inspection?.situation?.executed || inspection?.decision?.action;
  if (!hot.length || !action) return '';
  return `Inside its brain, the signal ran from ${hot.map((layer) => PLAIN_PART[layer]).join(' to ')} and out to the muscles that ${action}.`;
}

const BRAIN_CENTER_Y = -0.08;
const ZOOM_MIN = 1.1;
const ZOOM_MAX = 9;

function framedRadius(aspect, zoom) {
  const halfH = 0.6;
  const halfW = 0.95;
  const tanV = Math.tan((33 * Math.PI) / 360);
  const dist = Math.max(halfH / tanV, halfW / (tanV * Math.max(0.75, aspect || 1)));
  return dist * (zoom / DEFAULT_ORBIT.radius);
}

function placeCamera(camera, orbit) {
  const radius = framedRadius(camera.aspect, orbit.radius);
  const sinP = Math.sin(orbit.polar);
  const tx = Math.cos(orbit.azimuth) * orbit.panX;
  const tz = -Math.sin(orbit.azimuth) * orbit.panX;
  const ty = BRAIN_CENTER_Y + orbit.panY;
  camera.position.set(
    tx + radius * sinP * Math.sin(orbit.azimuth),
    ty + radius * Math.cos(orbit.polar),
    tz + radius * sinP * Math.cos(orbit.azimuth),
  );
  camera.lookAt(tx, ty, tz);
}

function zoomBy(rec, factor) {
  rec.orbit.radius = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, rec.orbit.radius * factor));
}

function resetOrbit(rec) {
  rec.orbit = { ...DEFAULT_ORBIT };
  if (rec.view) placeCamera(rec.view.camera, rec.orbit);
}

const GAIN_GLSL = `
uniform float u0;
uniform float u1;
uniform float u2;
uniform float u3;
uniform float u4;
float gainAt(float section) {
  if (section < 0.5) return u0;
  if (section < 1.5) return u1;
  if (section < 2.5) return u2;
  if (section < 3.5) return u3;
  return u4;
}
float anyGain() {
  return max(max(max(u0, u1), max(u2, u3)), u4);
}
uniform float t0;
uniform float t1;
uniform float t2;
uniform float t3;
uniform float t4;
uniform float uReward;
uniform float uPunish;
float toneAt(float section, float valence) {
  if (section < 0.5) return t0;
  if (section < 1.5) return valence > 0.5 ? uReward : valence < -0.5 ? uPunish : t1;
  if (section < 2.5) return t2;
  if (section < 3.5) return t3;
  return t4;
}
`;

const POINT_VERT = `
attribute vec3 color;
attribute float neuron;
attribute float section;
attribute float valence;
varying vec3 vColor;
varying float vGlow;
uniform float uSize;
${GAIN_GLSL}
void main() {
  float tone = toneAt(section, valence);
  float gain = gainAt(section);
  float level = clamp(gain * (0.45 + 0.55 * clamp(neuron * 3.0, 0.0, 1.0)) * tone, 0.0, 1.0);
  float dim = gain > 0.001 ? 1.0 : 1.0 - 0.65 * anyGain();
  vColor = mix(color * dim * (0.15 + 0.85 * tone), vec3(1.0), level * 0.6);
  vGlow = level;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(uSize * (1.15 + level * 1.8) * pow(3.4 / max(0.35, -mv.z), 0.6), 1.0, 4.5);
  gl_Position = projectionMatrix * mv;
}
`;

const LINE_VERT = `
attribute vec3 color;
attribute float actFrom;
attribute float actTo;
attribute float fromSection;
attribute float toSection;
varying vec3 vColor;
${GAIN_GLSL}
void main() {
  float fromGain = gainAt(fromSection);
  float toGain = gainAt(toSection);
  float lit = max(fromGain, toGain);
  float tone = fromGain >= toGain ? toneAt(fromSection, 0.0) : toneAt(toSection, 0.0);
  float level = clamp(lit * (0.5 + 0.5 * clamp(max(actFrom, actTo) * 3.0, 0.0, 1.0)) * tone, 0.0, 1.0);
  float dim = lit > 0.001 ? 1.0 : 1.0 - 0.7 * anyGain();
  vColor = mix(color * dim, vec3(1.0), level * 0.7);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const LINE_FRAG = `
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 0.62);
}
`;

const POINT_FRAG = `
varying vec3 vColor;
varying float vGlow;
void main() {
  vec2 q = gl_PointCoord - vec2(0.5);
  float d = dot(q, q);
  if (d > 0.25) discard;
  float alpha = smoothstep(0.25, 0.04, d) * (0.94 + vGlow * 0.06);
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
  const neuron = new Float32Array(count);
  const section = new Float32Array(count);
  const valence = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const point = samples[i];
    valence[i] = point.tint === 'reward' ? 1 : point.tint === 'punish' ? -1 : 0;
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
    const rest = REGION[point.section] || REGION.central;
    colors[i * 3] = rest[0] / 255;
    colors[i * 3 + 1] = rest[1] / 255;
    colors[i * 3 + 2] = rest[2] / 255;
    section[i] = SECTION_ID[point.section] ?? SECTION_ID.central;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('neuron', new THREE.BufferAttribute(neuron, 1));
  geometry.setAttribute('section', new THREE.BufferAttribute(section, 1));
  geometry.setAttribute('valence', new THREE.BufferAttribute(valence, 1));
  const uniforms = {
    uSize: { value: 1.25 },
    t0: { value: 1 },
    t1: { value: 1 },
    t2: { value: 1 },
    t3: { value: 1 },
    t4: { value: 1 },
    uReward: { value: 1 },
    uPunish: { value: 1 },
    u0: { value: 0 },
    u1: { value: 0 },
    u2: { value: 0 },
    u3: { value: 0 },
    u4: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  const group = new THREE.Group();
  group.scale.setScalar(BRAIN_SCALE);
  group.add(points);
  scene.add(group);
  return {
    renderer,
    scene,
    camera,
    group,
    points,
    lines: null,
    pairs: [],
    synapseKey: null,
    samples,
    count,
    uniforms,
    replay: { layer: null, gain: 0, index: 0, count: 0, resting: true },
    hot: [],
    means: null,
    baked: null,
  };
}

function neuronSpot(layer, index) {
  const i = index | 0;
  if (layer === 'sensory') {
    const sign = i < 6 ? -1 : 1;
    const t = (i % 6) / 5;
    const ang = -1.05 + t * 2.1;
    const lateral = 0.6 + Math.cos(ang) * 0.06;
    return { x: sign * lateral, y: Math.sin(ang) * 0.3 + 0.04, z: 0.03 };
  }
  if (layer === 'kenyon') {
    const sign = i < 5 ? -1 : 1;
    const t = (i % 5) / 4;
    return {
      x: sign * (0.05 + t * 0.16),
      y: 0.06 + Math.sin(t * Math.PI * 0.92) * 0.26,
      z: 0.14 - t * 0.26,
    };
  }
  if (layer === 'central') {
    const ang = (i / 10) * Math.PI * 2;
    const rad = 0.07 + (i % 3) * 0.035;
    return { x: Math.cos(ang) * rad, y: 0.04 + Math.sin(ang) * rad * 0.85, z: ((i % 2) - 0.5) * 0.06 };
  }
  if (layer === 'descending') {
    const t = i / 7;
    return { x: (i % 2 === 0 ? -1 : 1) * 0.04, y: -0.28 - t * 0.26, z: 0.02 };
  }
  const tip = MOTOR_TIPS[Math.max(0, Math.min(MOTOR_TIPS.length - 1, i))] || MOTOR_TIPS[0];
  return { x: tip[0], y: tip[1], z: tip[2] };
}

function synapseLinks(inspection) {
  const { nodes } = modelOf(inspection || {});
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = Array.isArray(inspection?.edges) ? inspection.edges : [];
  const links = [];
  for (const edge of edges) {
    const from = byId.get(String(edge.from)) || nodes[edge.from];
    const to = byId.get(String(edge.to)) || nodes[edge.to];
    if (!from || !to || !LAYERS.includes(from.layer) || !LAYERS.includes(to.layer)) continue;
    links.push({
      fromId: from.id,
      toId: to.id,
      fromIndex: from.index,
      toIndex: to.index,
      fromLayer: from.layer,
      toLayer: to.layer,
      a: neuronSpot(from.layer, from.y),
      b: neuronSpot(to.layer, to.y),
    });
  }
  return links;
}

function bendOf(fromId, toId) {
  let hash = 0;
  const text = `${fromId}${toId}`;
  for (let i = 0; i < text.length; i++) hash = (hash * 33 + text.charCodeAt(i)) % 997;
  return ((hash / 997) - 0.5) * 0.22;
}

function arcOf(a, b, bend) {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + bend, z: (a.z + b.z) / 2 + bend * 0.35 };
  const steps = 4;
  const points = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    points.push({
      x: u * u * a.x + 2 * u * t * mid.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * mid.y + t * t * b.y,
      z: u * u * a.z + 2 * u * t * mid.z + t * t * b.z,
    });
  }
  return points;
}

function litActivity(value) {
  const n = Number.isFinite(value) ? value : 0;
  return n >= QUIET ? n : 0;
}

function bakePointNeurons(samples, nodes, activity) {
  const values = sectionSamples(nodes, activity);
  const out = new Float32Array(samples.length);
  const cursor = {};
  for (const layer of LAYERS) cursor[layer] = 0;
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    const row = values[point.section] || [];
    let neuron = 0;
    if (Number.isFinite(point.neuron)) neuron = row[point.neuron] || 0;
    else if (row.length) {
      neuron = row[cursor[point.section] % row.length];
      cursor[point.section] += 1;
    }
    out[i] = neuron >= QUIET ? neuron : 0;
  }
  return out;
}

function writeLineActivity(view, activity) {
  const lines = view.lines;
  if (!lines || !view.pairs.length) return;
  const from = lines.geometry.getAttribute('actFrom').array;
  const to = lines.geometry.getAttribute('actTo').array;
  for (const pair of view.pairs) {
    const actFrom = litActivity(activity[pair.fromIndex]);
    const actTo = litActivity(activity[pair.toIndex]);
    for (let vertex = pair.v0; vertex < pair.v1; vertex++) {
      from[vertex] = actFrom;
      to[vertex] = actTo;
    }
  }
  lines.geometry.getAttribute('actFrom').needsUpdate = true;
  lines.geometry.getAttribute('actTo').needsUpdate = true;
}

function ensureSynapses(view, inspection, activity) {
  const links = synapseLinks(inspection);
  const key = links.map((link) => `${link.fromId}>${link.toId}`).join(',');
  if (key === view.synapseKey) {
    writeLineActivity(view, activity);
    return;
  }
  view.synapseKey = key;
  if (view.lines) {
    view.group.remove(view.lines);
    view.lines.geometry.dispose();
    view.lines.material.dispose();
    view.lines = null;
  }
  view.pairs = links;
  if (!links.length) return;
  const arcs = links.map((link) => arcOf(link.a, link.b, bendOf(link.fromId, link.toId)));
  let vertices = 0;
  arcs.forEach((pts) => { vertices += Math.max(0, pts.length - 1) * 2; });
  const linePositions = new Float32Array(vertices * 3);
  const lineColors = new Float32Array(vertices * 3);
  const actFrom = new Float32Array(vertices);
  const actTo = new Float32Array(vertices);
  const fromSection = new Float32Array(vertices);
  const toSection = new Float32Array(vertices);
  let cursor = 0;
  links.forEach((link, index) => {
    const pts = arcs[index];
    const rest = REGION[link.fromLayer] || REGION.central;
    const fromId = SECTION_ID[link.fromLayer] ?? SECTION_ID.central;
    const toId = SECTION_ID[link.toLayer] ?? SECTION_ID.central;
    const fromValue = litActivity(activity[link.fromIndex]);
    const toValue = litActivity(activity[link.toIndex]);
    link.v0 = cursor;
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s];
      const b = pts[s + 1];
      for (const point of [a, b]) {
        linePositions[cursor * 3] = point.x;
        linePositions[cursor * 3 + 1] = point.y;
        linePositions[cursor * 3 + 2] = point.z;
        lineColors[cursor * 3] = rest[0] / 255;
        lineColors[cursor * 3 + 1] = rest[1] / 255;
        lineColors[cursor * 3 + 2] = rest[2] / 255;
        actFrom[cursor] = fromValue;
        actTo[cursor] = toValue;
        fromSection[cursor] = fromId;
        toSection[cursor] = toId;
        cursor += 1;
      }
    }
    link.v1 = cursor;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
  geometry.setAttribute('actFrom', new THREE.BufferAttribute(actFrom, 1));
  geometry.setAttribute('actTo', new THREE.BufferAttribute(actTo, 1));
  geometry.setAttribute('fromSection', new THREE.BufferAttribute(fromSection, 1));
  geometry.setAttribute('toSection', new THREE.BufferAttribute(toSection, 1));
  view.lines = new THREE.LineSegments(geometry, new THREE.ShaderMaterial({
    uniforms: view.uniforms,
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    transparent: true,
    depthWrite: false,
  }));
  view.group.add(view.lines);
}

function resizeView(rec) {
  const view = rec.view;
  if (!view) return;
  const width = rec.viewHost.clientWidth;
  const height = rec.viewHost.clientHeight;
  if (width < 2 || height < 2) return;
  if (view.viewW === width && view.viewH === height) return;
  view.viewW = width;
  view.viewH = height;
  view.camera.aspect = width / height;
  view.camera.updateProjectionMatrix();
  view.renderer.setSize(width, height, false);
}

function setText(el, text) {
  if (!el || el.textContent === text) return;
  el.textContent = text;
}

function bakeBrain(view, inspection) {
  const { nodes, activity } = modelOf(inspection || {});
  view.means = sectionMeans(nodes, activity);
  const executed = inspection?.situation?.executed || inspection?.decision?.action || '';
  view.hot = playbackSections(view.means, executed);
  view.tone = toneOf(inspection);
  applyTone(view.uniforms, view.tone);
  const baked = bakePointNeurons(view.samples, nodes, activity);
  const neuron = view.points.geometry.getAttribute('neuron');
  neuron.array.set(baked);
  neuron.needsUpdate = true;
  ensureSynapses(view, inspection, activity);
}

/**
 * Visual encoding of the model's small, bounded neuromodulator proxies (0..1).
 * The names are inspired by insect systems, but they are not transmitter
 * measurements or a simulation of PAM/PPL1 or identified octopamine cells.
 */
function toneOf(inspection) {
  const state = inspection?.neuromodulators || {};
  const octopamine = Number.isFinite(state.octopamine) ? state.octopamine : 0.5;
  const reward = Number.isFinite(state.reward) ? state.reward : 0.5;
  const punishment = Number.isFinite(state.punishment) ? state.punishment : 0.5;
  const scale = (v) => 0.25 + 1.35 * v;
  return {
    octopamine,
    reward,
    punish: punishment,
    tones: [scale(0.5), scale(0.5), scale(octopamine), scale(octopamine), scale(0.5)],
    rewardTone: scale(reward),
    punishTone: scale(punishment),
  };
}

function applyTone(uniforms, tone) {
  uniforms.t0.value = tone.tones[0];
  uniforms.t1.value = tone.tones[1];
  uniforms.t2.value = tone.tones[2];
  uniforms.t3.value = tone.tones[3];
  uniforms.t4.value = tone.tones[4];
  uniforms.uReward.value = tone.rewardTone;
  uniforms.uPunish.value = tone.punishTone;
}

function toneLine(tone) {
  const pick = (v, low, mid, high) => (v >= 0.66 ? high : v >= 0.36 ? mid : low);
  return `Its mood: ${pick(tone.octopamine, 'calm', 'alert', 'fired up')}, `
    + `${pick(tone.reward, 'not feeling lucky', 'neutral about its luck', 'riding a good run')}, `
    + `and ${pick(tone.punish, 'unbothered by losses', 'a little wary', 'stung by recent losses')}. `
    + 'These are simple stand-ins for fly brain chemistry and only nudge its choices slightly.';
}

const HELD_GAIN = 0.7;

function applyGains(uniforms, replay, hot) {
  const gains = [0, 0, 0, 0, 0];
  if (replay.layer && replay.resting) {
    for (const layer of hot) gains[SECTION_ID[layer]] = HELD_GAIN;
  }
  if (replay.layer) gains[SECTION_ID[replay.layer]] = replay.gain;
  uniforms.u0.value = gains[0];
  uniforms.u1.value = gains[1];
  uniforms.u2.value = gains[2];
  uniforms.u3.value = gains[3];
  uniforms.u4.value = gains[4];
}

function paintCaption(rec, replay) {
  const hot = rec.view.hot;
  const executed = rec.inspection?.situation?.executed || rec.inspection?.decision?.action || '';
  const key = !hot.length
    ? 'rest'
    : `${replay.layer}|${replay.index}|${replay.count}|${replay.resting ? 1 : 0}|${executed}`;
  if (key === rec.captionKey) return;
  rec.captionKey = key;
  if (!hot.length) {
    setText(rec.step, 'Resting');
    setText(rec.count, '');
    setText(rec.links, 'no section above threshold');
    setText(rec.part, 'No region is flaring. The colors are the resting brain.');
    return;
  }
  setText(rec.step, LAYER_TITLE[replay.layer] || '');
  setText(rec.count, `step ${replay.index + 1} / ${replay.count}`);
  setText(rec.links, PLACE[replay.layer] || '');
  setText(
    rec.part,
    replay.layer === 'motor' && executed
      ? `Motor neurons are acting: ${executed}.`
      : (PART_LINE[replay.layer] || ''),
  );
}

function paintRegions(rec, now) {
  const view = rec.view;
  if (view.baked !== rec.inspection) {
    bakeBrain(view, rec.inspection);
    view.baked = rec.inspection;
    rec.captionKey = '';
  }
  const replay = replayHot(now, rec.brainT0 || now, view.hot, view.replay);
  applyGains(view.uniforms, replay, view.hot);
  paintCaption(rec, replay);
}

function renderView(rec, now) {
  if (!rec.view) rec.view = buildView(rec.viewHost);
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
  if (view.lines) {
    view.lines.geometry.dispose();
    view.lines.material.dispose();
  }
  rec.view = null;
}

const DOING = { fold: 'folding', check: 'checking', call: 'calling', bet: 'betting', raise: 'raising' };
const RANK_NAME = { T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };
const BAND_WORDS = {
  premium: 'a great starting hand',
  strong: 'a strong starting hand',
  playable: 'a decent starting hand',
  weak: 'a weak starting hand',
};
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** "54o (weak)" -> "5-4 in different suits, a weak starting hand"; postflop names are already words. */
function handWords(decision) {
  const name = String(decision.handName || '');
  const pre = name.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)\b/);
  if (!pre) {
    if (!name) return 'its cards';
    if (/^\w+ high$/.test(name)) return `nothing but ${name}`;
    if (!/^(pair|straight|full|royal|broadway)|flush$/.test(name)) return name;
    return `${/^[aeiou8]/.test(name) ? 'an' : 'a'} ${name}`;
  }
  const rank = (c) => RANK_NAME[c] || c;
  const cards = pre[1] === pre[2]
    ? `a pair of ${rank(pre[1])}s`
    : `${rank(pre[1])}-${rank(pre[2])} ${pre[3] === 's' ? 'of the same suit' : 'in different suits'}`;
  return `${cards}, ${BAND_WORDS[decision.handCategory] || 'a starting hand'}`;
}

function thoughtLine(inspection) {
  const decision = inspection?.decision;
  if (!decision?.action) return 'Nothing to weigh yet.';
  return `${capital(DOING[decision.action] || decision.action)} with ${handWords(decision)}.`;
}

function spanOf(before, after) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return '';
  return ` (${before.toFixed(3)} → ${after.toFixed(3)})`;
}

function pctSpan(before, after) {
  return ` (${Math.round(before * 100)}% → ${Math.round(after * 100)}%)`;
}

function learnedLines(inspection) {
  const last = inspection?.learning?.last;
  if (!last) return ['Nothing has been learned yet.'];
  const deltas = Array.isArray(last.deltas) ? last.deltas : [];
  const hand = Number.isFinite(last.handNumber) ? `Hand ${last.handNumber}` : 'Last hand';
  if (!deltas.length) return [`${hand}: nothing tracked moved.`];
  const lines = [];
  let note = null;
  for (const delta of deltas) {
    const parameter = String(delta?.parameter || '');
    const span = spanOf(Number(delta.before), Number(delta.after));
    if (parameter.startsWith('gain:')) {
      const link = parameter.slice(5).replace('->', ' → ');
      const verb = Number(delta.delta) < 0 ? 'eased' : 'strengthened';
      lines.push(`${hand}: model connection ${link} ${verb}${span}.`);
    } else if (parameter.startsWith('mod.')) {
      continue;
    } else if (parameter.startsWith('follow.')) {
      lines.push(`${hand}: ${delta.why}, so the chance of following them moved${pctSpan(delta.before, delta.after)}.`);
    } else if (parameter === 'copyStrength') {
      lines.push(`${hand}: ${delta.why}, so copy strength moved${span}.`);
    } else if (parameter === 'aggression' || parameter === 'bluff' || parameter === 'foldToPressure') {
      const label = parameter === 'foldToPressure' ? 'Fold-to-pressure' : parameter === 'bluff' ? 'Bluff rate' : 'Aggression';
      lines.push(`${hand}: ${label} nudged${span}.`);
    } else if (parameter.startsWith('opp.') && (!note || Math.abs(Number(delta.delta) || 0) > Math.abs(Number(note.delta) || 0))) {
      note = delta;
    }
  }
  if (note) lines.push(`${hand}: ${note.why || note.parameter}.`);
  return lines.length ? lines : [`${hand}: nothing tracked moved.`];
}

function badgeOf(accessory, color) {
  const el = svg('svg', {
    viewBox: '0 0 48 48',
    class: 'fly-brain-badge',
    'aria-hidden': 'true',
  });
  const add = (name, attrs) => el.appendChild(svg(name, { fill: color, ...attrs }));
  if (accessory === 'top-hat') {
    add('rect', { x: 16, y: 8, width: 16, height: 16, rx: 1 });
    add('ellipse', { cx: 24, cy: 28, rx: 16, ry: 5 });
  } else if (accessory === 'scarf') {
    add('path', { d: 'M8 18c10 3 22 3 32 0-2 7-8 9-12 8 3 6 5 12 3 16-5-5-7-10-7-14-1 5-3 11-8 16-1-5 1-11 3-16-5 1-9-1-11-10z' });
  } else if (accessory === 'monocle') {
    add('circle', { cx: 22, cy: 20, r: 10, fill: 'none', stroke: color, 'stroke-width': 3 });
    add('path', { d: 'M31 26c3 5 3 9 1 14', fill: 'none', stroke: color, 'stroke-width': 2 });
  } else if (accessory === 'bow') {
    add('path', { d: 'M24 22 C18 10 6 12 8 22 C14 24 20 23 24 22z' });
    add('path', { d: 'M24 22 C30 10 42 12 40 22 C34 24 28 23 24 22z' });
    add('circle', { cx: 24, cy: 23, r: 3 });
    add('path', { d: 'M22 25c-1 6-3 10-7 12 3-1 5-4 6-8z' });
    add('path', { d: 'M26 25c1 6 3 10 7 12-3-1-5-4-6-8z' });
  } else if (accessory === 'crown') {
    add('path', { d: 'M6 32 L10 16 L18 24 L24 10 L30 24 L38 16 L42 32 Z' });
    add('rect', { x: 6, y: 32, width: 36, height: 5 });
  } else if (accessory === 'sunglasses') {
    add('rect', { x: 4, y: 17, width: 40, height: 3, rx: 1.5 });
    add('path', { d: 'M7 19h15c0 8-3 12-8 12s-7-4-7-12z' });
    add('path', { d: 'M26 19h15c0 8-2 12-7 12s-8-4-8-12z' });
  } else {
    add('circle', { cx: 24, cy: 24, r: 8 });
  }
  return el;
}

function cardText(cards) {
  if (!Array.isArray(cards) || !cards.length) return '';
  return cards.map((card) => card?.code || `${card?.rank || ''}${card?.suit || ''}`).filter(Boolean).join(' ');
}

function decisionText(inspection) {
  const decision = inspection?.decision;
  const situation = inspection?.situation || {};
  if (!decision?.action) {
    return { hand: 'No hand is in front of this fly.', why: '', executed: '', activations: '' };
  }
  const board = cardText(situation.board);
  const win = Math.round((decision.equityEstimate || 0) * 100);
  const need = Math.round((decision.potOdds || 0) * 100);
  const pricey = win + 5 < need;
  const cheap = win >= need + 5;
  const anyway = pricey && (decision.action === 'bet' || decision.action === 'raise') ? ` It ${decision.action}s anyway, hoping the others fold.`
    : pricey && decision.action === 'call' ? ' It calls anyway.'
    : cheap && decision.action === 'fold' ? ' It folds anyway.'
    : '';
  const why = !(decision.toCall > 0)
    ? `It guesses it wins about ${win} times in 100, and nobody has bet, so staying in is free.`
    : `It guesses it wins about ${win} times in 100. Calling ${decision.toCall} chips only pays off if it wins at least ${need} in 100, so `
      + (cheap ? 'the price is worth it.' : pricey ? 'the price is too high.' : "it's a close call.") + anyway;

  const logits = situation.logits || decision.logits || {};
  const mine = logits[decision.action];
  const [alt, altScore] = Object.entries(logits)
    .filter(([name, value]) => name !== decision.action && Number.isFinite(value) && value > -1e8)
    .sort((a, b) => b[1] - a[1])[0] || [];
  const doing = DOING[decision.action] || decision.action;
  const other = DOING[alt] || alt;
  const gap = mine - altScore;
  const sure = !alt || !Number.isFinite(gap) ? ''
    : gap >= 1 ? `It wasn't torn: ${doing} felt much better than ${other}.`
    : gap >= 0.3 ? `${capital(doing)} felt a bit better than ${other}.`
    : gap >= 0 ? `It nearly went with ${other} instead.`
    : `${capital(other)} actually felt slightly better, but flies aren't perfectly predictable.`;

  const reasons = (decision.reasons || []).map(String);
  const copying = reasons.find((line) => /^(Copying|Following) /.test(line));
  const facing = reasons.map((line) => line.match(/^(\w+)'s learned aggression/)).find(Boolean);
  const social = copying
    ? copying.replace(/ \(copy strength [^)]*\)/, '').replace(/^Copying (\w+)'s (\w+)/, "It's copying $1, who chose to $2")
      .replace(/^Following (\w+)'s style; .*/, "It's playing like $1, who hasn't moved yet") + '.'
    : facing ? `It's also thinking about how pushy ${facing[1]} has been.` : '';

  return {
    hand: board ? `On the table: ${board}.` : 'No shared cards are on the table yet.',
    why,
    executed: sure,
    activations: social,
  };
}

function compareText(inspection) {
  const compare = inspection?.policyCompare;
  if (!compare || !compare.decisions) return 'The frozen copy has not been scored yet.';
  const last = compare.lastLive && compare.lastFrozen
    ? ` Last step the live policy ${compare.lastLive} and the frozen copy would have ${compare.lastFrozen}.`
    : '';
  const moved = compare.moved
    ? ` Since hand ${compare.sinceHand}, ${compare.handsSince} later hand${compare.handsSince === 1 ? '' : 's'}, chips ${compare.chipsSince >= 0 ? '+' : ''}${compare.chipsSince}, wins ${compare.winsSince}.`
    : ' The policy has not moved.';
  return `Frozen copy disagrees on ${compare.disagreements} of ${compare.decisions} decisions.${last}${moved}`;
}

function paintChrome(rec) {
  const inspection = rec.inspection || {};
  const color = accentOf(inspection);
  rec.root.style.setProperty('--fly', color);
  rec.style.textContent = inspection.playstyle?.label || inspection.style || '';
  rec.name.textContent = inspection.name || 'Fly';
  rec.action.textContent = actionText(inspection.decision);
  rec.reason.textContent = reasonText(inspection.decision);
  rec.learn.textContent = learningText(inspection.learning);
  rec.thought.textContent = thoughtLine(inspection);
  const brief = decisionText(inspection);
  rec.hand.textContent = brief.hand;
  rec.why.textContent = brief.why;
  rec.executed.textContent = brief.executed;
  rec.activations.textContent = brief.activations;
  rec.toneNote.textContent = inspection.decision?.action ? toneLine(toneOf(inspection)) : '';
  rec.path.textContent = firedPath(inspection);
  rec.compare.textContent = compareText(inspection);
  const learned = learnedLines(inspection);
  rec.growth.replaceChildren(...learned.map((line) => {
    const item = document.createElement('li');
    item.textContent = line;
    return item;
  }));
  paintHistory(rec);
  requestNarration(rec);
  const next = badgeOf(inspection.accessory, color);
  rec.badge.replaceWith(next);
  rec.badge = next;
}

function narrationFacts(record) {
  if (!record) return [];
  return learnedLines({ learning: { last: record } }).filter((line) => (
    line && !line.startsWith('Nothing has been learned') && !line.endsWith('nothing tracked moved.')
  ));
}

function narrationKey(inspection, record, facts) {
  return `${inspection?.id || ''}|${record?.handNumber ?? ''}|${facts.join('\n')}`;
}

function historyItem(text) {
  const item = document.createElement('li');
  const line = document.createElement('p');
  line.textContent = text;
  item.append(line);
  return item;
}

function syncProfileCompare(rec, history) {
  const select = rec.comparePick;
  if (!select) return null;
  const rows = Array.isArray(history) ? history : [];
  const key = rows.map((row) => row.handNumber).join(',');
  if (select.dataset.hands !== key) {
    const previous = select.value;
    select.replaceChildren();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Current only';
    select.append(none);
    for (let i = rows.length - 1; i >= 0; i--) {
      const option = document.createElement('option');
      option.value = String(rows[i].handNumber);
      option.textContent = `Hand ${rows[i].handNumber}`;
      select.append(option);
    }
    select.dataset.hands = key;
    if (previous && rows.some((row) => String(row.handNumber) === previous)) select.value = previous;
    else if (rows.length) select.value = String(rows[rows.length - 1].handNumber);
    else select.value = '';
  }
  if (!select.value) return null;
  return rows.find((row) => String(row.handNumber) === select.value) || null;
}

function traceRadar(g, at, values, fill, stroke, width) {
  if (!values || !values.length) return;
  g.beginPath();
  values.forEach((value, i) => {
    const [x, y] = at(i, Math.max(0, Math.min(1, value)));
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = stroke;
  g.lineWidth = width;
  g.stroke();
}

function paintRadar(rec) {
  const canvas = rec.radar;
  const profile = rec.inspection && rec.inspection.profile;
  if (!canvas || !profile || !Array.isArray(profile.axes) || profile.axes.length < 3) return;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const measured = cssW >= 8 && cssH >= 8;
  const w = Math.round((measured ? cssW : 960) * (measured ? dpr : 1));
  const h = Math.round((measured ? cssH : 280) * (measured ? dpr : 1));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.5;
  const rx = Math.min(w * 0.22, h * 0.34);
  const ry = rx;
  const axes = profile.axes;
  const n = axes.length;
  const color = rec.inspection.colorHex || '#e6c27a';
  const at = (i, scale) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(ang) * rx * scale, cy + Math.sin(ang) * ry * scale];
  };
  g.strokeStyle = 'rgba(246, 240, 228, 0.28)';
  g.lineWidth = measured ? dpr : 1;
  for (const ring of [0.25, 0.5, 0.75, 1]) {
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const [x, y] = at(i % n, ring);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i, 1);
    g.moveTo(cx, cy);
    g.lineTo(x, y);
  }
  g.stroke();
  const earlier = syncProfileCompare(rec, profile.history);
  const stroke = measured ? dpr : 1;
  if (earlier) traceRadar(g, at, earlier.values, 'rgba(246, 240, 228, 0.14)', 'rgba(246, 240, 228, 0.45)', 1.5 * stroke);
  traceRadar(
    g,
    at,
    axes.map((axis) => axis.value),
    color.length === 7 ? `${color}55` : 'rgba(230, 194, 122, 0.35)',
    color,
    2 * stroke,
  );
  g.fillStyle = '#f6f0e4';
  g.font = `${Math.max(12, Math.round(13 * stroke))}px Georgia, serif`;
  axes.forEach((axis, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const [x, y] = at(i, 1.18);
    g.textAlign = Math.cos(ang) > 0.35 ? 'left' : Math.cos(ang) < -0.35 ? 'right' : 'center';
    g.textBaseline = Math.sin(ang) > 0.35 ? 'top' : Math.sin(ang) < -0.35 ? 'bottom' : 'middle';
    g.fillText(axis.label, x, y);
  });
  if (rec.profileNote) rec.profileNote.textContent = styleShift(axes, earlier);
}

function styleShift(axes, earlier) {
  if (!earlier) return 'Pick an earlier hand above to see how its style has shifted.';
  let best = null;
  axes.forEach((axis, i) => {
    const move = axis.value - (earlier.values[i] ?? axis.value);
    if (!best || Math.abs(move) > Math.abs(best.move)) best = { label: axis.label.toLowerCase(), move };
  });
  const since = `Faded shape: hand ${earlier.handNumber}. Solid: now.`;
  if (!best || Math.abs(best.move) < 0.03) return `${since} Its style has barely moved.`;
  return `${since} The biggest shift is ${best.move > 0 ? 'more' : 'less'} ${best.label}.`;
}

/** Size a canvas to its CSS box at device resolution; returns a context and pixel size. */
function fitChart(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round((canvas.clientWidth || 300) * dpr));
  const h = Math.max(1, Math.round((canvas.clientHeight || 90) * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = `${Math.round(11 * dpr)}px Georgia, serif`;
  return { g, w, h, dpr };
}

const INK = 'rgba(246, 240, 228, 0.55)';

function paintChips(slot, rows, start, color) {
  const { g, w, h, dpr } = fitChart(slot.canvas);
  const stacks = [start, ...rows.map((row) => row.stack).filter(Number.isFinite)];
  if (stacks.length < 2) {
    slot.note.textContent = 'Fills in once this fly has played a hand.';
    return;
  }
  const lo = Math.min(...stacks, start) * 0.95;
  const hi = Math.max(...stacks, start) * 1.05 || 1;
  const pad = 6 * dpr;
  const x = (i) => pad + (i / (stacks.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - ((v - lo) / (hi - lo || 1)) * (h - pad * 2);
  g.setLineDash([4 * dpr, 4 * dpr]);
  g.strokeStyle = INK;
  g.lineWidth = dpr;
  g.beginPath();
  g.moveTo(pad, y(start));
  g.lineTo(w - pad, y(start));
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = INK;
  g.textBaseline = 'bottom';
  g.fillText(`start ${start}`, pad, y(start) - 2 * dpr);
  g.strokeStyle = color;
  g.lineWidth = 2.5 * dpr;
  g.beginPath();
  stacks.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
  g.stroke();
  const net = stacks[stacks.length - 1] - start;
  const hands = stacks.length - 1;
  slot.note.textContent = net === 0
    ? `Even after ${hands} hand${hands === 1 ? '' : 's'}.`
    : `${net > 0 ? 'Up' : 'Down'} ${Math.abs(net)} chips over ${hands} hand${hands === 1 ? '' : 's'}.`;
}

function paintRewire(slot, rows, color) {
  const { g, w, h, dpr } = fitChart(slot.canvas);
  const values = rows.map((row) => row.rewire).filter(Number.isFinite);
  if (!values.length) {
    slot.note.textContent = 'Each bar will be one hand: taller means its model connections changed more.';
    return;
  }
  const top = Math.max(...values) || 1;
  const gap = 2 * dpr;
  const bw = Math.max(2 * dpr, (w - gap * (values.length - 1)) / values.length);
  g.fillStyle = color;
  values.forEach((v, i) => {
    const bh = Math.max(dpr, (v / top) * (h - 4 * dpr));
    g.fillRect(i * (bw + gap), h - bh, bw, bh);
  });
  if (values.length < 6) {
    slot.note.textContent = 'Taller bars mean its model connections changed more after that hand.';
    return;
  }
  const third = Math.max(1, Math.floor(values.length / 3));
  const avg = (list) => list.reduce((s, v) => s + v, 0) / list.length;
  const early = avg(values.slice(0, third));
  const late = avg(values.slice(-third));
  slot.note.textContent = late < early * 0.7
    ? 'Its connections are settling down: recent hands change them less than early ones did.'
    : late > early * 1.3
      ? 'Its connections are changing more than before, so recent hands surprised it.'
      : 'Its connections keep changing at a steady pace as it plays.';
}

const FLY_COLOR = Object.fromEntries(FLIES.map((fly) => [fly.id, `#${fly.color.toString(16).padStart(6, '0')}`]));

function paintFollow(slot, mimic) {
  slot.box.hidden = !mimic;
  if (!mimic) return;
  const { g, w, h, dpr } = fitChart(slot.canvas);
  const rows = mimic.follow || [];
  const rowH = h / Math.max(1, rows.length);
  const labelW = 54 * dpr;
  g.textBaseline = 'middle';
  rows.forEach((row, i) => {
    const y = i * rowH;
    g.fillStyle = INK;
    g.fillText(row.name, 0, y + rowH / 2);
    g.fillStyle = FLY_COLOR[row.id] || INK;
    const bw = Math.max(dpr, row.share * (w - labelW - 40 * dpr));
    g.fillRect(labelW, y + rowH * 0.2, bw, rowH * 0.6);
    g.fillStyle = INK;
    g.fillText(`${Math.round(row.share * 100)}%`, labelW + bw + 6 * dpr, y + rowH / 2);
  });
  const top = rows[0];
  const how = mimic.copyStrength < 0.35 ? 'loosely' : mimic.copyStrength < 0.65 ? 'fairly closely' : 'very closely';
  slot.note.textContent = top
    ? `Copies ${top.name} most (${Math.round(top.share * 100)}%). Flies that win get copied more. It mirrors their moves ${how}.`
    : '';
}

function paintFrozen(slot, note, compare) {
  const { g, w, h, dpr } = fitChart(slot.canvas);
  const total = compare?.decisions || 0;
  const differ = compare?.disagreements || 0;
  const drift = compare?.drift || 0;
  const FULL = 0.1;
  g.fillStyle = 'rgba(246, 240, 228, 0.12)';
  g.fillRect(0, h * 0.25, w, h * 0.5);
  g.fillStyle = '#e6c27a';
  g.fillRect(0, h * 0.25, Math.max(drift > 0 ? 2 * dpr : 0, w * Math.min(1, drift / FULL)), h * 0.5);
  g.fillStyle = INK;
  g.textBaseline = 'middle';
  g.textAlign = 'right';
  g.fillText(`${(drift * 100).toFixed(1)}%`, w - 4 * dpr, h / 2);
  g.textAlign = 'left';
  const head = 'A frozen copy of its starting model weighs every decision too.';
  if (!total) {
    note.textContent = `${head} The bar shows how far the learning brain's leanings have drifted from it.`;
    return;
  }
  const flips = differ
    ? ` That has changed its final pick ${differ} time${differ === 1 ? '' : 's'} out of ${total}`
      + (Number.isFinite(compare.chipsSince) ? `, ${compare.chipsSince >= 0 ? 'winning' : 'losing'} ${Math.abs(compare.chipsSince)} chips since.` : '.')
    : ' Not enough yet to change its final pick, since its playing style still decides most moves.';
  note.textContent = drift < 0.002
    ? `${head} Its leanings still match its starting self.`
    : `${head} Its leanings have drifted ${(drift * 100).toFixed(1)}% from where it started.${flips}`;
}

function paintInsights(rec) {
  const inspection = rec.inspection || {};
  const rows = inspection.profile?.history || [];
  const color = inspection.colorHex || '#e6c27a';
  paintRadar(rec);
  paintChips(rec.insights.chips, rows, inspection.profile?.startStack ?? 1000, color);
  paintRewire(rec.insights.rewire, rows, color);
  paintFollow(rec.insights.follow, inspection.mimic);
  paintFrozen(rec.insights.frozen, rec.historyCompare, inspection.policyCompare);
}

function paintHistory(rec) {
  if (!rec.history) return;
  const inspection = rec.inspection || {};
  if (rec.tab === 'learning') paintInsights(rec);
  const recent = Array.isArray(inspection.learning?.recent) ? inspection.learning.recent.slice(-3) : [];
  if (!recent.length) {
    rec.history.replaceChildren(historyItem('Nothing has been learned yet.'));
    return;
  }
  const rows = recent.slice().reverse().map((record) => {
    const item = document.createElement('li');
    for (const line of learnedLines({ learning: { last: record } })) {
      const fact = document.createElement('p');
      fact.textContent = line;
      item.append(fact);
    }
    const facts = narrationFacts(record);
    const key = facts.length ? narrationKey(inspection, record, facts) : '';
    const sentence = key ? rec.narrations?.get(key) : '';
    if (sentence) {
      const said = document.createElement('p');
      said.className = 'fly-brain-adapt';
      said.textContent = sentence;
      item.append(said);
    }
    return item;
  });
  rec.history.replaceChildren(...rows);
}

function requestNarration(rec) {
  const inspection = rec.inspection || {};
  const record = inspection.learning?.last;
  const facts = narrationFacts(record);
  if (!facts.length) {
    rec.adapt.textContent = '';
    rec.narrateKey = '';
    return;
  }
  const key = narrationKey(inspection, record, facts);
  const known = rec.narrations?.get(key);
  if (known) {
    rec.narrateKey = key;
    rec.adapt.textContent = known;
    return;
  }
  if (key === rec.narrateKey) return;
  rec.narrateKey = key;
  const token = (rec.narrateToken || 0) + 1;
  rec.narrateToken = token;
  fetch(NARRATE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ facts }),
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    return response.ok && typeof data.text === 'string' ? data.text.trim() : '';
  }).catch(() => '').then((text) => {
    if (token !== rec.narrateToken) return;
    const said = text || plainLesson(record);
    rec.narrations.set(key, said);
    rec.adapt.textContent = said;
    paintHistory(rec);
  });
}

/** Template wording used whenever Gemini is busy, cooling down, or unreachable. */
function plainLesson(record) {
  const deltas = Array.isArray(record?.deltas) ? record.deltas : [];
  const hand = Number.isFinite(record?.handNumber) ? `After hand ${record.handNumber}` : 'After the last hand';
  let up = 0;
  let down = 0;
  const bits = [];
  for (const d of deltas) {
    const parameter = String(d?.parameter || '');
    const rose = Number(d.delta) > 0;
    if (parameter.startsWith('gain:')) rose ? up++ : down++;
    else if (parameter === 'aggression') bits.push(`plays a little ${rose ? 'more' : 'less'} aggressively`);
    else if (parameter === 'bluff') bits.push(`bluffs a little ${rose ? 'more' : 'less'}`);
    else if (parameter === 'foldToPressure') bits.push(`folds under pressure a little ${rose ? 'more' : 'less'}`);
    else if (parameter.startsWith('follow.') || parameter === 'copyStrength') bits.push('copies a different mix of flies');
  }
  const links = (n) => `${n} model connection${n === 1 ? '' : 's'}`;
  const wires = up && down
    ? `${links(up)} got stronger and ${down} got weaker`
    : up ? `${links(up)} got stronger` : down ? `${links(down)} got weaker` : '';
  const uniq = [...new Set(bits)];
  if (!wires && !uniq.length) return `${hand}, no tracked model parameter changed.`;
  if (!uniq.length) return `${hand}, ${wires}.`;
  return `${hand}, ${wires ? `${wires}, and it now ` : 'it now '}${uniq.join(', ')}.`;
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
  rec.learnPane.hidden = tab !== 'learning';
  rec.nowPane.hidden = tab !== 'now';
  rec.tabCircuit.setAttribute('aria-selected', tab === 'circuit' ? 'true' : 'false');
  rec.tabBrain.setAttribute('aria-selected', tab === 'brain' ? 'true' : 'false');
  rec.tabLearn.setAttribute('aria-selected', tab === 'learning' ? 'true' : 'false');
  rec.tabNow.setAttribute('aria-selected', tab === 'now' ? 'true' : 'false');
  if (tab === 'brain' && !rec.root.hidden) startLoop(rec);
  else stopLoop(rec);
  if (tab === 'circuit') requestAnimationFrame(() => renderCircuit(rec));
  if (tab === 'learning') requestAnimationFrame(() => paintInsights(rec));
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
  const badge = badgeOf('', '#e6c27a');
  const titles = document.createElement('div');
  titles.className = 'fly-brain-who';
  const style = document.createElement('p');
  style.className = 'fly-brain-kicker';
  const name = document.createElement('h2');
  titles.append(style, name);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'fly-brain-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  head.append(badge, titles, close);

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
  const tabLearn = document.createElement('button');
  tabLearn.type = 'button';
  tabLearn.textContent = 'Insights';
  tabLearn.setAttribute('role', 'tab');
  tabLearn.setAttribute('aria-selected', 'false');
  const tabNow = document.createElement('button');
  tabNow.type = 'button';
  tabNow.textContent = 'Right now';
  tabNow.setAttribute('role', 'tab');
  tabNow.setAttribute('aria-selected', 'false');
  tabs.append(tabCircuit, tabBrain, tabNow, tabLearn);

  const stage = document.createElement('div');
  stage.className = 'fly-brain-stage';
  const circuitPane = document.createElement('div');
  circuitPane.className = 'fly-brain-pane';
  const circuitEmpty = document.createElement('p');
  circuitEmpty.className = 'fly-brain-empty';
  circuitEmpty.hidden = true;
  circuitEmpty.textContent = 'No circuit on this fly.';
  const board = svg('svg', {
    viewBox: '0 0 1200 320',
    preserveAspectRatio: 'none',
    class: 'fly-brain-circuit',
    role: 'img',
  });
  circuitPane.append(circuitEmpty, board);

  const brainPane = document.createElement('div');
  brainPane.className = 'fly-brain-pane fly-brain-gl';
  brainPane.hidden = true;
  const viewHost = document.createElement('div');
  viewHost.className = 'fly-brain-view';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'fly-brain-reset';
  reset.textContent = 'Reset';
  const zoomOut = reset.cloneNode();
  zoomOut.textContent = '−';
  zoomOut.setAttribute('aria-label', 'Zoom out');
  const zoomIn = reset.cloneNode();
  zoomIn.textContent = '+';
  zoomIn.setAttribute('aria-label', 'Zoom in');
  const tools = document.createElement('div');
  tools.className = 'fly-brain-tools';
  tools.append(zoomOut, zoomIn, reset);
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
    const hot = REGION[layer];
    swatch.style.background = `rgb(${hot[0]}, ${hot[1]}, ${hot[2]})`;
    item.append(swatch, document.createTextNode(LAYER_TITLE[layer]));
    legend.appendChild(item);
  }
  const links = document.createElement('span');
  legend.appendChild(links);
  viewHost.append(tools, caption, legend);
  const live = document.createElement('aside');
  live.className = 'fly-brain-live';
  const thoughtKicker = document.createElement('p');
  thoughtKicker.className = 'fly-brain-kicker live';
  thoughtKicker.textContent = 'Right now';
  const thought = document.createElement('p');
  thought.className = 'fly-brain-thought';
  thought.textContent = 'Nothing to weigh yet.';
  const hand = document.createElement('p');
  hand.className = 'fly-brain-part';
  const why = document.createElement('p');
  why.className = 'fly-brain-part';
  const executed = document.createElement('p');
  executed.className = 'fly-brain-part';
  const activations = document.createElement('p');
  activations.className = 'fly-brain-part';
  const compareKicker = document.createElement('p');
  compareKicker.className = 'fly-brain-kicker live';
  compareKicker.textContent = 'Frozen copy';
  const compare = document.createElement('p');
  compare.className = 'fly-brain-part';
  compare.textContent = 'The frozen copy has not been scored yet.';
  const part = document.createElement('p');
  part.className = 'fly-brain-part';
  part.textContent = 'No region is flaring. The colors are the resting brain.';
  const toneNote = document.createElement('p');
  toneNote.className = 'fly-brain-part';
  const path = document.createElement('p');
  path.className = 'fly-brain-path';
  const growthKicker = document.createElement('p');
  growthKicker.className = 'fly-brain-kicker live';
  growthKicker.textContent = 'This hand';
  const growth = document.createElement('ul');
  growth.className = 'fly-brain-growth';
  const waiting = document.createElement('li');
  waiting.textContent = 'Nothing has been learned yet.';
  growth.append(waiting);
  const adapt = document.createElement('p');
  adapt.className = 'fly-brain-adapt';
  live.append(part, growthKicker, adapt, growth, compareKicker, compare);
  brainPane.append(viewHost, live);
  const nowPane = document.createElement('div');
  nowPane.className = 'fly-brain-pane fly-brain-learn-pane fly-brain-now-pane';
  nowPane.hidden = true;
  nowPane.append(thoughtKicker, thought, hand, why, executed, activations, toneNote, path);
  const learnPane = document.createElement('div');
  learnPane.className = 'fly-brain-pane fly-brain-learn-pane fly-insights';
  learnPane.hidden = true;
  const card = (title) => {
    const box = document.createElement('section');
    box.className = 'fly-insight';
    const head = document.createElement('p');
    head.className = 'fly-brain-kicker live';
    head.textContent = title;
    const note = document.createElement('p');
    note.className = 'fly-insight-note';
    box.append(head);
    return { box, note };
  };
  const chart = (cls = '') => {
    const canvas = document.createElement('canvas');
    canvas.className = `fly-insight-chart ${cls}`;
    return canvas;
  };
  const chipsCard = card('Chips over time');
  const chipsChart = chart();
  chipsCard.box.append(chipsChart, chipsCard.note);
  const rewireCard = card('How much its brain changed each hand');
  const rewireChart = chart();
  rewireCard.box.append(rewireChart, rewireCard.note);
  const followCard = card('Who it copies');
  const followChart = chart('tall');
  followCard.box.append(followChart, followCard.note);
  const frozenCard = card('Learning vs. never learning');
  const frozenChart = chart('short');
  frozenCard.box.append(frozenChart, frozenCard.note);

  const profileKicker = document.createElement('p');
  profileKicker.className = 'fly-brain-kicker live';
  profileKicker.textContent = 'Playing style';
  const compareRow = document.createElement('label');
  compareRow.className = 'fly-brain-part';
  compareRow.textContent = 'Compare with ';
  const comparePick = document.createElement('select');
  comparePick.className = 'fly-brain-compare';
  const onlyNow = document.createElement('option');
  onlyNow.value = '';
  onlyNow.textContent = 'Current only';
  comparePick.append(onlyNow);
  compareRow.append(comparePick);
  const radar = document.createElement('canvas');
  radar.className = 'fly-brain-radar';
  radar.width = 960;
  radar.height = 280;
  const profileNote = document.createElement('p');
  profileNote.className = 'fly-insight-note';
  const styleCard = document.createElement('section');
  styleCard.className = 'fly-insight';
  styleCard.append(profileKicker, compareRow, radar, profileNote);
  const historyCompare = frozenCard.note;
  const handsCard = card('Recent lessons');
  const history = document.createElement('ol');
  history.className = 'fly-brain-history';
  history.append(historyItem('Nothing has been learned yet.'));
  handsCard.box.append(history);
  learnPane.append(chipsCard.box, rewireCard.box, followCard.box, styleCard, frozenCard.box, handsCard.box);
  stage.append(circuitPane, brainPane, nowPane, learnPane);

  const learn = document.createElement('p');
  learn.className = 'fly-brain-learn';

  root.append(head, action, reason, tabs, stage, learn);
  container.appendChild(root);

  const rec = {
    root,
    badge,
    style,
    name,
    action,
    reason,
    learn,
    tabCircuit,
    tabBrain,
    tabLearn,
    tabNow,
    nowPane,
    circuitPane,
    circuitEmpty,
    svg: board,
    brainPane,
    viewHost,
    step,
    count,
    links,
    thought,
    hand,
    why,
    executed,
    activations,
    toneNote,
    compare,
    part,
    path,
    learnPane,
    historyCompare,
    history,
    radar,
    comparePick,
    profileNote,
    insights: {
      chips: { canvas: chipsChart, note: chipsCard.note },
      rewire: { canvas: rewireChart, note: rewireCard.note },
      follow: { canvas: followChart, note: followCard.note, box: followCard.box },
      frozen: { canvas: frozenChart },
    },
    narrations: new Map(),
    growth,
    adapt,
    narrateKey: '',
    narrateToken: 0,
    inspection: null,
    tab: 'circuit',
    raf: 0,
    brainT0: 0,
    orbit: { ...DEFAULT_ORBIT },
    view: null,
    drag: null,
    hideTimer: 0,
  };
  panels.set(root, rec);

  close.addEventListener('click', () => hideBrain(root));
  tabCircuit.addEventListener('click', () => selectTab(rec, 'circuit'));
  tabBrain.addEventListener('click', () => selectTab(rec, 'brain'));
  tabLearn.addEventListener('click', () => selectTab(rec, 'learning'));
  tabNow.addEventListener('click', () => selectTab(rec, 'now'));
  comparePick.addEventListener('change', () => paintRadar(rec));
  if (typeof ResizeObserver === 'function') {
    const watcher = new ResizeObserver(() => {
      renderCircuit(rec);
      if (rec.tab === 'learning') paintInsights(rec);
    });
    watcher.observe(stage);
  }
  reset.addEventListener('click', () => resetOrbit(rec));
  zoomIn.addEventListener('click', () => zoomBy(rec, 0.75));
  zoomOut.addEventListener('click', () => zoomBy(rec, 1 / 0.75));
  viewHost.addEventListener('contextmenu', (event) => event.preventDefault());
  viewHost.addEventListener('dblclick', (event) => {
    if (tools.contains(event.target)) return;
    zoomBy(rec, 0.6);
  });
  viewHost.addEventListener('pointerdown', (event) => {
    if (tools.contains(event.target)) return;
    const pan = event.button === 2 || event.shiftKey;
    rec.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan };
    viewHost.setPointerCapture(event.pointerId);
  });
  viewHost.addEventListener('pointermove', (event) => {
    if (!rec.drag || rec.drag.id !== event.pointerId) return;
    const dx = event.clientX - rec.drag.x;
    const dy = event.clientY - rec.drag.y;
    if (rec.drag.pan) {
      const scale = (rec.orbit.radius / DEFAULT_ORBIT.radius) * 2.4 / Math.max(200, viewHost.clientHeight);
      rec.orbit.panX = Math.max(-1, Math.min(1, rec.orbit.panX - dx * scale));
      rec.orbit.panY = Math.max(-0.7, Math.min(0.7, rec.orbit.panY + dy * scale));
    } else {
      rec.orbit.azimuth -= dx * 0.007;
      rec.orbit.polar = Math.max(0.18, Math.min(Math.PI - 0.18, rec.orbit.polar + dy * 0.005));
    }
    rec.drag.x = event.clientX;
    rec.drag.y = event.clientY;
  });
  const endDrag = () => { rec.drag = null; };
  viewHost.addEventListener('pointerup', endDrag);
  viewHost.addEventListener('pointercancel', endDrag);
  viewHost.addEventListener('wheel', (event) => {
    if (rec.tab !== 'brain') return;
    event.preventDefault();
    zoomBy(rec, Math.exp(event.deltaY * 0.0015));
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
  clearTimeout(rec.hideTimer);
  const closed = rec.root.hidden || !rec.root.classList.contains('is-open');
  rec.root.hidden = false;
  if (closed) {
    rec.root.classList.remove('is-open');
    requestAnimationFrame(() => {
      if (!rec.root.hidden) rec.root.classList.add('is-open');
    });
  }
  paintChrome(rec);
  renderCircuit(rec);
  if (rec.tab === 'brain') startLoop(rec);
}

export function hideBrain(panel) {
  const rec = panels.get(panel);
  if (!rec || rec.root.hidden) return;
  rec.root.classList.remove('is-open');
  clearTimeout(rec.hideTimer);
  rec.hideTimer = setTimeout(() => {
    if (rec.root.classList.contains('is-open')) return;
    rec.root.hidden = true;
    stopLoop(rec);
    disposeView(rec);
  }, 300);
}
