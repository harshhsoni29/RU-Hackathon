/** Roster, default thresholds, and the optional config/styles.json overlay. */

export const FLIES = Object.freeze([
  Object.freeze({ id: 'vera', name: 'Vera', style: 'tight-aggressive', accessory: 'top-hat', color: 0x1f7a4d }),
  Object.freeze({ id: 'buzz', name: 'Buzz', style: 'loose-aggressive', accessory: 'scarf', color: 0xd4892a }),
  Object.freeze({ id: 'nib', name: 'Nib', style: 'tight-passive', accessory: 'monocle', color: 0x3d5a80 }),
  Object.freeze({ id: 'callie', name: 'Callie', style: 'loose-passive', accessory: 'bow', color: 0xd4537e }),
  Object.freeze({ id: 'mani', name: 'Mani', style: 'maniac', accessory: 'crown', color: 0xc23b22 }),
  Object.freeze({ id: 'soni', name: 'Soni', style: 'copycat', accessory: 'sunglasses', color: 0x7b5cd6 }),
]);

export const DEALER = Object.freeze({ id: 'chip', name: 'Chip', kind: 'beetle' });

export const STYLE_META = Object.freeze({
  'tight-aggressive': Object.freeze({
    label: 'Tight-aggressive',
    summary: 'Plays a narrow range, bets and raises for value, and folds weak hands. Pressure comes from bets rather than calls.',
  }),
  'loose-aggressive': Object.freeze({
    label: 'Loose-aggressive',
    summary: 'Enters many pots and applies pressure with frequent bets, raises, and some bluffs.',
  }),
  'tight-passive': Object.freeze({
    label: 'Tight-passive',
    summary: 'A nit. Very few hands, calls more often than raises, and overfolds once the betting starts.',
  }),
  'loose-passive': Object.freeze({
    label: 'Loose-passive',
    summary: 'A calling station. Plays many hands, calls too often, and rarely bluffs or folds after putting chips in.',
  }),
  maniac: Object.freeze({
    label: 'Maniac',
    summary: 'Extremely wide range and constant aggression. High variance, thin value, and frequent bluffs.',
  }),
  copycat: Object.freeze({
    label: 'Copycat',
    summary: 'Has no style of its own. Each hand it follows one other fly, plays that fly\'s style, and leans toward repeating its last move. It learns whom to follow and how closely.',
  }),
});

const KEYS = ['vpip', 'pfr', 'aggression', 'bluff', 'foldToPressure', 'learnRate'];

export const DEFAULT_STYLES = Object.freeze({
  vera: Object.freeze({ vpip: 0.22, pfr: 0.18, aggression: 2.4, bluff: 0.12, foldToPressure: 0.62, learnRate: 0.15 }),
  buzz: Object.freeze({ vpip: 0.36, pfr: 0.28, aggression: 3.1, bluff: 0.3, foldToPressure: 0.4, learnRate: 0.18 }),
  nib: Object.freeze({ vpip: 0.11, pfr: 0.07, aggression: 0.55, bluff: 0.02, foldToPressure: 0.8, learnRate: 0.12 }),
  callie: Object.freeze({ vpip: 0.52, pfr: 0.08, aggression: 0.4, bluff: 0.03, foldToPressure: 0.16, learnRate: 0.15 }),
  mani: Object.freeze({ vpip: 0.7, pfr: 0.58, aggression: 5.5, bluff: 0.58, foldToPressure: 0.1, learnRate: 0.21 }),
  soni: Object.freeze({ vpip: 0.34, pfr: 0.2, aggression: 1.9, bluff: 0.18, foldToPressure: 0.45, learnRate: 0.15 }),
});

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function clampStyle(raw) {
  const vpip = clamp(raw.vpip, 0, 1);
  const pfr = Math.min(vpip, clamp(raw.pfr, 0, 1));
  return {
    vpip,
    pfr,
    aggression: clamp(raw.aggression, 0, 20),
    bluff: clamp(raw.bluff, 0, 1),
    foldToPressure: clamp(raw.foldToPressure, 0, 1),
    learnRate: clamp(raw.learnRate, 0, 0.5),
  };
}

function overlay(base, extra) {
  const out = { ...base };
  if (!extra || typeof extra !== 'object') return out;
  for (const key of KEYS) {
    if (extra[key] != null && Number.isFinite(Number(extra[key]))) out[key] = Number(extra[key]);
  }
  return out;
}

export function aggressionPrior(style) {
  return clamp(style.aggression / (style.aggression + 1.5), 0.05, 0.95);
}

export function emptyModel() {
  return { hands: 0, vpip: 0, pfr: 0, bets: 0, raises: 0, calls: 0, folds: 0, checks: 0 };
}

/** Prior strength is 8 hands, then counts take over. */
export function smoothedRates(counts, priorStyle) {
  const p = 8;
  const actions = counts.bets + counts.raises + counts.calls + counts.folds;
  return {
    vpip: (priorStyle.vpip * p + counts.vpip) / (p + counts.hands),
    pfr: (priorStyle.pfr * p + counts.pfr) / (p + counts.hands),
    aggression: (aggressionPrior(priorStyle) * p + counts.bets + counts.raises) / (p + actions),
    foldRate: (priorStyle.foldToPressure * p + counts.folds) / (p + actions),
    hands: counts.hands,
  };
}

function readStylesFile() {
  const proc = globalThis.process;
  if (!proc?.versions?.node || typeof proc.getBuiltinModule !== 'function') return null;
  const fs = proc.getBuiltinModule('fs');
  const path = proc.getBuiltinModule('path');
  const url = proc.getBuiltinModule('url');
  const here = url.fileURLToPath(import.meta.url);
  const file = path.resolve(path.dirname(here), '../../config/styles.json');
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('styles.json must be an object keyed by fly id');
  }
  return parsed;
}

export function resolveStyles(configStyles) {
  let file = null;
  let warning = null;
  try {
    file = readStylesFile();
  } catch (err) {
    warning = err.message;
  }
  const styles = {};
  for (const fly of FLIES) {
    const merged = overlay(overlay(DEFAULT_STYLES[fly.id], file && file[fly.id]), configStyles && configStyles[fly.id]);
    styles[fly.id] = clampStyle(merged);
  }
  let source = 'defaults';
  if (file && configStyles) source = 'file+config';
  else if (configStyles) source = 'config';
  else if (file) source = 'file';
  return { styles, source, warning };
}

export function colorHex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}
