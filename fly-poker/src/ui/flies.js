/** Chunky seated flies and the beetle dealer. All meshes are primitives. */

import * as THREE from 'three';
<<<<<<< HEAD
=======
import { DEALER_ANGLE, SEAT, SEATS, TABLE, ovalPoint } from './room.js';
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
import { wingTexture } from './textures.js';

const wingGeo = new THREE.PlaneGeometry(0.62, 0.32);
let sharedWingTex = null;

function wingMap() {
  if (!sharedWingTex) sharedWingTex = wingTexture();
  return sharedWingTex;
}

function shade(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function limb(a, b, radius, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.72, len, 6), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return shade(mesh);
}

function addLeg(group, side, index, material) {
<<<<<<< HEAD
  const zHip = [0.14, 0.0, -0.12][index];
  const zFoot = [0.2, 0.02, -0.28][index];
  const out = 0.1 + index * 0.02;
  const hip = new THREE.Vector3(side * 0.12, 0.28, zHip);
  const knee = new THREE.Vector3(side * (0.22 + out), 0.14, (zHip + zFoot) * 0.5);
  const foot = new THREE.Vector3(side * (0.1 + out), 0.03, zFoot);
=======
  // Feet rest on the cushion. Hips stay on the body, knees bow out so the legs
  // clear the seat box instead of passing through it.
  const zHip = [0.08, -0.02, -0.1][index];
  const zFoot = [0.14, 0.04, -0.04][index];
  const hip = new THREE.Vector3(side * 0.12, 0.32, zHip);
  const knee = new THREE.Vector3(side * 0.3, 0.22, (zHip + zFoot) * 0.5);
  const foot = new THREE.Vector3(side * 0.22, 0.16, zFoot);
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
  group.add(limb(hip, knee, 0.028, material));
  group.add(limb(knee, foot, 0.02, material));
}

function addAccessory(head, kind) {
  const black = new THREE.MeshStandardMaterial({ color: 0x16120f, roughness: 0.45 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe6c15a, metalness: 0.75, roughness: 0.28 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.7 });
  const wine = new THREE.MeshStandardMaterial({ color: 0x8e1e32, roughness: 0.55 });

  if (kind === 'top-hat') {
    const brim = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 14), black));
    brim.position.y = 0.12;
    const crown = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 14), black));
    crown.position.y = 0.21;
    const band = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.03, 14), wine));
    band.position.y = 0.15;
    head.add(brim, crown, band);
  } else if (kind === 'scarf') {
    const wrap = shade(new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.032, 6, 14), wine));
    wrap.rotation.x = Math.PI / 2;
    wrap.position.set(0, -0.02, 0.04);
    const tail = shade(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.025), wine));
    tail.position.set(0.12, -0.16, 0.06);
    tail.rotation.z = 0.35;
    const stripe = shade(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 0.028), cloth));
    stripe.position.copy(tail.position);
    stripe.rotation.z = tail.rotation.z;
    head.add(wrap, tail, stripe);
  } else if (kind === 'monocle') {
    const ring = shade(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 6, 16), gold));
    ring.position.set(0.1, 0.02, -0.1);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.072, 14),
      new THREE.MeshStandardMaterial({
        color: 0xc9e4ff,
        transparent: true,
        opacity: 0.35,
        roughness: 0.05,
        metalness: 0.1,
      }),
    );
    lens.position.set(0.1, 0.02, -0.1);
    const chainMat = gold;
    for (let i = 0; i < 4; i++) {
      const bead = shade(new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), chainMat));
      bead.position.set(0.16 + i * 0.028, -0.02 - i * 0.04, -0.04);
      head.add(bead);
    }
    head.add(ring, lens);
  } else if (kind === 'bow') {
    const loopGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const left = shade(new THREE.Mesh(loopGeo, cloth));
    left.scale.set(1.35, 0.85, 0.45);
    left.position.set(-0.07, 0.12, 0.02);
    left.rotation.z = 0.5;
    const right = shade(new THREE.Mesh(loopGeo, cloth));
    right.scale.set(1.35, 0.85, 0.45);
    right.position.set(0.07, 0.12, 0.02);
    right.rotation.z = -0.5;
    const knot = shade(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), wine));
    knot.position.set(0, 0.11, 0.04);
    head.add(left, right, knot);
  } else if (kind === 'crown') {
    const band = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.05, 8), gold));
    band.position.y = 0.13;
    head.add(band);
    for (let i = 0; i < 5; i++) {
      const tip = shade(new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.1, 5), gold));
      const a = (i / 5) * Math.PI * 2;
      tip.position.set(Math.cos(a) * 0.09, 0.2, Math.sin(a) * 0.09);
      head.add(tip);
    }
    const jewel = shade(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({
      color: 0x49b6e8,
      emissive: 0x1a6ea8,
      emissiveIntensity: 0.6,
      roughness: 0.2,
    })));
    jewel.position.set(0, 0.14, -0.1);
    head.add(jewel);
  }
}

/**
 * Seated fly. Local origin is the seat, local -Z faces the table.
 * Returns the group plus pieces the scene animates.
 */
export function createFly(meta) {
  const group = new THREE.Group();
  group.name = meta.id;
  group.userData.flyId = meta.id;

  const color = new THREE.Color(meta.color);
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.06 });
  const thoraxMat = new THREE.MeshStandardMaterial({
    color: color.clone().lerp(new THREE.Color(0x140c08), 0.18),
    roughness: 0.42,
    metalness: 0.08,
  });
  const bandMat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.35), roughness: 0.6 });
  const legMat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.45), roughness: 0.55 });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x2a060c,
    emissive: 0x4a1018,
    emissiveIntensity: 0.35,
    roughness: 0.22,
    metalness: 0.08,
    flatShading: true,
  });

  const abdomen = shade(new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), body));
  abdomen.scale.set(1.15, 0.9, 1.75);
  abdomen.position.set(0, 0.3, 0.16);
  abdomen.rotation.x = -0.4;
  group.add(abdomen);

  for (let i = 0; i < 3; i++) {
    const band = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.028, 12), bandMat));
    band.rotation.x = Math.PI / 2 - 0.4;
    band.position.set(0, 0.3 + i * 0.012, 0.06 + i * 0.1);
    group.add(band);
  }

  const thorax = shade(new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), thoraxMat));
  thorax.scale.set(1.25, 1.05, 1.05);
  thorax.position.set(0, 0.4, -0.05);
  group.add(thorax);

  const head = new THREE.Group();
  head.position.set(0, 0.56, -0.24);
  const skull = shade(new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), body));
  skull.scale.set(1.15, 1.0, 0.95);
  head.add(skull);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = shade(new THREE.Mesh(new THREE.SphereGeometry(0.086, 7, 6), eyeMat));
    eye.position.set(side * 0.1, 0.02, -0.08);
    head.add(eye);
    eyes.push(eye);
  }

  const antennaMat = legMat;
  for (const side of [-1, 1]) {
    const ant = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), antennaMat));
    ant.position.set(side * 0.05, 0.16, -0.06);
    ant.rotation.x = -0.7;
    ant.rotation.z = side * -0.35;
    head.add(ant);
  }

  addAccessory(head, meta.accessory);
  group.add(head);

  for (let i = 0; i < 3; i++) {
    addLeg(group, 1, i, legMat);
    addLeg(group, -1, i, legMat);
  }

  const wings = [];
  const wingBases = [];
  for (const side of [-1, 1]) {
    const mat = new THREE.MeshStandardMaterial({
      map: wingMap(),
      color: color.clone().lerp(new THREE.Color(0xffffff), 0.72),
      transparent: true,
      opacity: 0.78,
      roughness: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const wing = new THREE.Mesh(wingGeo, mat);
    wing.castShadow = false;
    wing.position.set(side * 0.16, 0.52, 0.0);
    const baseZ = side * 0.85;
    wing.rotation.set(-0.55, side * -0.15, baseZ);
    group.add(wing);
    wings.push(wing);
    wingBases.push(baseZ);
  }

  const toned = [
    { mat: body, base: color.clone() },
    { mat: thoraxMat, base: thoraxMat.color.clone() },
  ];
  return { group, wings, wingBases, eyes, eyeMat, toned, phase: Math.random() * Math.PI * 2 };
}

/** Smaller standing beetle. Local origin is the feet, local -Z faces the table. */
export function createBeetle() {
  const group = new THREE.Group();
  group.name = 'chip';

  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x173528,
    emissive: 0x0c2418,
    emissiveIntensity: 0.25,
    metalness: 0.55,
    roughness: 0.32,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24180f, roughness: 0.6 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.4, metalness: 0.2 });

  const belly = shade(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), dark));
  belly.scale.set(1.3, 0.7, 1.5);
  belly.position.set(0, 0.22, 0.02);
  group.add(belly);

  const shell = shade(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), shellMat));
  shell.scale.set(1.25, 0.85, 1.45);
  shell.position.set(0, 0.34, 0.04);
  group.add(shell);

  const seam = shade(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.08, 0.42), dark));
  seam.position.set(0, 0.46, 0.04);
  group.add(seam);

  const head = shade(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), dark));
  head.position.set(0, 0.3, -0.22);
  group.add(head);

  const horn = shade(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 7), hornMat));
  horn.position.set(0, 0.42, -0.34);
  horn.rotation.x = Math.PI / 2 - 0.55;
  group.add(horn);

  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x1a120c,
    roughness: 0.3,
    flatShading: true,
  });
  for (const side of [-1, 1]) {
    const eye = shade(new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), eyeMat));
    eye.position.set(side * 0.07, 0.34, -0.28);
    group.add(eye);
  }

  const legMat = dark;
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const z = -0.08 + i * 0.1;
      const hip = new THREE.Vector3(side * 0.12, 0.18, z);
      const knee = new THREE.Vector3(side * 0.22, 0.1, z + 0.02);
      const foot = new THREE.Vector3(side * 0.16, 0.02, z + 0.06);
      group.add(limb(hip, knee, 0.02, legMat));
      group.add(limb(knee, foot, 0.016, legMat));
    }
  }

  group.scale.setScalar(1.28);
  return group;
}
<<<<<<< HEAD
=======

function roundPlate(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeSprite(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
  }));
  sprite.renderOrder = 8;
  return { sprite, canvas, ctx, tex, key: '' };
}

function paintTag(tag, name, stack, color, acting) {
  const key = `${name}|${stack}|${acting ? 1 : 0}`;
  if (tag.key === key) return;
  tag.key = key;
  const { ctx, canvas, tex } = tag;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(18, 10, 8, 0.86)';
  roundPlate(ctx, 16, 10, canvas.width - 32, canvas.height - 20, 28);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = acting ? '#fff4d2' : `#${color.toString(16).padStart(6, '0')}`;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f6efe4';
  ctx.font = '700 56px Palatino, Georgia, serif';
  ctx.fillText(name, canvas.width / 2, 72);
  ctx.fillStyle = '#e6c27a';
  ctx.font = '600 42px sans-serif';
  ctx.fillText(String(stack), canvas.width / 2, 122);
  tex.needsUpdate = true;
}

/** Reaction kinds. Bust beats a win, and a win beats the action face. */
const EMOTE_GLYPH = {
  fold: 'D:',
  win: ':D',
  raise: '>:(',
  bet: '>:D',
  call: ':3',
  check: '•⊕•',
  bust: 'x_x',
};

const EMOTE_ALIAS = {
  fold: 'fold',
  folded: 'fold',
  out: 'fold',
  'D:': 'fold',
  win: 'win',
  won: 'win',
  ':D': 'win',
  raise: 'raise',
  '>:(': 'raise',
  bet: 'bet',
  '>:D': 'bet',
  call: 'call',
  ':3': 'call',
  check: 'check',
  '•‿•': 'check',
  '•⊕•': 'check',
  bust: 'bust',
  'x_x': 'bust',
};

function emoteKind(value) {
  if (value == null || value === '') return '';
  return EMOTE_ALIAS[value] || '';
}

function markerStroke(ctx, pts, width, color) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const nx = (pts[i][0] + pts[i + 1][0]) / 2;
    const ny = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], nx, ny);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function ink(ctx, pts, width, color) {
  markerStroke(ctx, pts, width + 9, '#2a140e');
  markerStroke(ctx, pts, width, color);
}

function drawDot(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r + 4, 0, Math.PI * 2);
  ctx.fillStyle = '#2a140e';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 1, y - 1, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawD(ctx, x, y, h, color, wobble) {
  const stem = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    stem.push([
      x + Math.sin(t * Math.PI) * wobble,
      y - h + t * h * 2 + Math.sin(t * 6.2) * wobble * 0.35,
    ]);
  }
  const bowl = [];
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14;
    const angle = -Math.PI / 2 + t * Math.PI;
    const rx = h * (0.92 + 0.08 * Math.sin(t * Math.PI));
    const ry = h * (0.96 + 0.05 * Math.sin(t * 5));
    bowl.push([
      x + 2 + Math.cos(angle) * rx,
      y + Math.sin(angle) * ry + Math.sin(t * 4) * wobble * 0.25,
    ]);
  }
  ink(ctx, stem, h * 0.42, color);
  ink(ctx, bowl, h * 0.38, color);
}

function drawColon(ctx, x, y, h, color) {
  drawDot(ctx, x - 1, y - h * 0.42, h * 0.16, color);
  drawDot(ctx, x + 3, y + h * 0.4, h * 0.18, color);
}

function drawChevron(ctx, x, y, h, color) {
  ink(ctx, [
    [x - h * 0.42, y - h * 0.78],
    [x + h * 0.46, y - h * 0.04],
    [x - h * 0.36, y + h * 0.8],
  ], h * 0.3, color);
}

function drawParen(ctx, x, y, h, color) {
  const pts = [];
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    const angle = -1.15 + t * 2.3;
    pts.push([
      x - Math.cos(angle) * h * 0.55,
      y + Math.sin(angle) * h * 0.95,
    ]);
  }
  ink(ctx, pts, h * 0.28, color);
}

function drawThree(ctx, x, y, h, color) {
  const pts = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const angle = -0.85 + t * 2.05;
    pts.push([x + Math.cos(angle) * h * 0.5, y - h * 0.46 + Math.sin(angle) * h * 0.42]);
  }
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const angle = -0.45 + t * 2.15;
    pts.push([x + Math.cos(angle) * h * 0.52, y + h * 0.46 + Math.sin(angle) * h * 0.44]);
  }
  ink(ctx, pts, h * 0.26, color);
}

function drawOplus(ctx, x, y, h, color) {
  const ring = [];
  for (let i = 0; i <= 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    ring.push([
      x + Math.cos(angle) * h * 0.48 * (1 + 0.05 * Math.sin(angle * 3)),
      y + Math.sin(angle) * h * 0.46,
    ]);
  }
  ink(ctx, ring, h * 0.2, color);
  ink(ctx, [[x, y - h * 0.28], [x + 1, y + h * 0.3]], h * 0.16, color);
  ink(ctx, [[x - h * 0.3, y + 1], [x + h * 0.32, y]], h * 0.16, color);
}

function drawEx(ctx, x, y, h, color) {
  ink(ctx, [[x - h * 0.42, y - h * 0.5], [x + h * 0.4, y + h * 0.52]], h * 0.26, color);
  ink(ctx, [[x + h * 0.38, y - h * 0.48], [x - h * 0.4, y + h * 0.5]], h * 0.26, color);
}

function drawBar(ctx, x, y, h, color) {
  ink(ctx, [
    [x - h * 0.4, y + 2],
    [x, y - 3],
    [x + h * 0.42, y + 3],
  ], h * 0.22, color);
}

const EMOTE_PARTS = {
  fold: ['D', ':'],
  win: [':', 'D'],
  raise: ['>', ':', '('],
  bet: ['>', ':', 'D'],
  call: [':', '3'],
  check: ['•', '⊕', '•'],
  bust: ['x', '_', 'x'],
};

function drawGoofyEmote(ctx, canvas, kind) {
  const parts = EMOTE_PARTS[kind];
  const color = kind === 'bust' ? '#f3c7c7' : '#fff4d4';
  const wobble = kind === 'fold' || kind === 'win' || kind === 'bet' ? 6 : 3;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 + 6;
  ctx.fillStyle = 'rgba(24, 12, 8, 0.72)';
  ctx.beginPath();
  for (let i = 0; i <= 20; i += 1) {
    const angle = (i / 20) * Math.PI * 2;
    const bump = 1 + (kind === 'fold' ? 0.08 : 0.04) * Math.sin(angle * 3);
    const x = cx + Math.cos(angle) * 168 * bump;
    const y = cy + Math.sin(angle) * 70 * bump;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  const gap = 18;
  const widths = parts.map((part) => (part === 'D' ? 108 : part === '⊕' ? 78 : 56));
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (parts.length - 1);
  let cursor = cx - total / 2;
  parts.forEach((part, index) => {
    const width = widths[index];
    const x = cursor + width / 2;
    const y = cy + Math.sin(index * 1.7) * (kind === 'fold' ? 8 : 3);
    const h = part === 'D' ? 58 : 46;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((index - (parts.length - 1) / 2) * (part === 'D' ? 0.08 : 0.04));
    if (part === 'D') drawD(ctx, 0, 0, h, color, wobble);
    else if (part === ':') drawColon(ctx, 0, 0, h, color);
    else if (part === '>') drawChevron(ctx, 0, 0, h, color);
    else if (part === '(') drawParen(ctx, 0, 0, h, color);
    else if (part === '3') drawThree(ctx, 0, 0, h, color);
    else if (part === '•') drawDot(ctx, 0, 0, h * 0.22, color);
    else if (part === '⊕') drawOplus(ctx, 0, 0, h, color);
    else if (part === 'x') drawEx(ctx, 0, 0, h, color);
    else if (part === '_') drawBar(ctx, 0, 0, h, color);
    ctx.restore();
    cursor += width + gap;
  });
}

function paintEmote(tag, kind) {
  const next = emoteKind(kind);
  if (tag.key === next) return;
  tag.key = next;
  tag.kind = next;
  const { ctx, canvas, tex, sprite } = tag;
  sprite.visible = Boolean(next);
  if (!next) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    tex.needsUpdate = true;
    return;
  }
  drawGoofyEmote(ctx, canvas, next);
  tex.needsUpdate = true;
}

const FADED_MESH_OPACITY = 0.28;

function collectBodyMaterials(group) {
  const materials = [];
  const seen = new Set();
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      materials.push({
        mat,
        opacity: mat.opacity,
        transparent: mat.transparent,
        depthWrite: mat.depthWrite,
      });
    }
  });
  return materials;
}

function applyFlyFade(fly, faded) {
  if (fly.faded === faded) return;
  fly.faded = faded;
  for (const entry of fly.bodyMaterials) {
    entry.mat.transparent = faded ? true : entry.transparent;
    entry.mat.opacity = faded ? FADED_MESH_OPACITY : entry.opacity;
    entry.mat.depthWrite = faded ? false : entry.depthWrite;
    entry.mat.needsUpdate = true;
  }
}

/** Folded, sitting out, or busted. An all-in fly still in the live hand stays solid. */
function flyMeshFaded(row, handLive) {
  if (!row) return false;
  if (row.folded || row.sittingOut) return true;
  if (Number(row.stack) > 0) return false;
  return !(handLive && row.allIn);
}

function aimInward(obj, x, z) {
  obj.lookAt(x, obj.position.y, z);
  obj.rotateY(Math.PI);
}

function makeChair(color) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.62 });
  const cushion = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.4), cushion);
  seat.position.set(0, 0.42, 0.02);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.05), wood);
  back.position.set(0, 0.66, 0.48);
  for (const [x, z] of [[-0.24, -0.1], [0.24, -0.1], [-0.24, 0.2], [0.24, 0.2]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.42, 6), wood);
    leg.position.set(x, 0.21, z);
    group.add(leg);
  }
  group.add(seat, back);
  return group;
}

/**
 * Five flies and Chip. Each pivot faces the table center.
 * outward is the direction a hole card's face should point (toward that fly).
 */
export function placeCast(scene, flies) {
  const seats = [];
  for (const spec of SEATS) {
    const meta = flies.find((fly) => fly.id === spec.id);
    const point = ovalPoint(spec.angle, SEAT.rx, SEAT.rz);
    const pivot = new THREE.Group();
    pivot.name = spec.id;
    pivot.position.set(point.x, 0, point.z);
    pivot.userData.flyId = spec.id;
    scene.add(pivot);
    pivot.add(makeChair(meta.color));

    const fly = createFly(meta);
    // Belly rests just above the cushion. Shift toward the table so the abdomen
    // clears the chair back, which now sits behind the fly.
    fly.group.position.set(0, 0.34, -0.16);
    pivot.add(fly.group);

    const tag = makeSprite(512, 168);
    tag.sprite.position.y = 1.18;
    tag.sprite.scale.set(0.58, 0.19, 1);
    fly.group.add(tag.sprite);

    const emote = makeSprite(512, 220);
    emote.baseY = 1.46;
    emote.sprite.position.y = emote.baseY;
    emote.sprite.scale.set(0.56, 0.24, 1);
    emote.sprite.visible = false;
    emote.kind = '';
    fly.group.add(emote.sprite);
    fly.bodyMaterials = collectBodyMaterials(fly.group);
    fly.faded = false;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.4, 28),
      new THREE.MeshBasicMaterial({ color: meta.color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    ring.visible = false;
    pivot.add(ring);

    const outward = new THREE.Vector3(point.x - TABLE.x, 0, point.z - TABLE.z).normalize();
    const cardAnchor = ovalPoint(spec.angle, TABLE.feltRx * 0.7, TABLE.feltRz * 0.58);
    cardAnchor.y = TABLE.top + 0.03;
    seats.push({
      id: spec.id,
      name: meta.name,
      color: meta.color,
      angle: spec.angle,
      pivot,
      fly,
      tag,
      emote,
      ring,
      position: { x: point.x, y: 0, z: point.z },
      outward: { x: outward.x, y: 0, z: outward.z },
      cardAnchor,
    });
  }

  const dealerPoint = ovalPoint(DEALER_ANGLE, SEAT.rx + 0.16, 0.15);
  const dealerPivot = new THREE.Group();
  dealerPivot.position.set(dealerPoint.x, 0, dealerPoint.z);
  scene.add(dealerPivot);
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.6 });
  const seatTop = 0.98;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, seatTop - 0.12, 8), wood);
  post.position.y = (seatTop - 0.12) / 2;
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 12), wood);
  stool.position.y = seatTop - 0.04;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.06, 10), wood);
  foot.position.y = 0.03;
  dealerPivot.add(post, stool, foot);
  const beetle = createBeetle();
  beetle.position.y = seatTop;
  dealerPivot.add(beetle);
  const dealerTag = makeSprite(512, 128);
  dealerTag.sprite.position.y = 1.82;
  dealerTag.sprite.scale.set(0.48, 0.12, 1);
  dealerPivot.add(dealerTag.sprite);
  paintTag(dealerTag, 'Chip', 'dealer', 0xd4b06a, false);

  const manualEmote = new Map();
  let seenHand = null;
  let latestState = null;
  let latestWinners = new Set();

  function faceTable() {
    for (const seat of seats) aimInward(seat.pivot, TABLE.x, TABLE.z);
    aimInward(dealerPivot, TABLE.x, TABLE.z);
  }

  function latestActionKind(state, id) {
    const events = state?.lastActions;
    if (!events?.length) return '';
    const hand = state.handNumber;
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.flyId !== id) continue;
      if (hand != null && event.handNumber != null && event.handNumber !== hand) break;
      return emoteKind(event.action);
    }
    return '';
  }

  function reactionFor(seat, row, winners, state) {
    if (row && Number(row.stack) === 0) return 'bust';
    if (winners.has(seat.id)) return 'win';
    const forced = manualEmote.get(seat.id)?.kind || '';
    if (forced === 'win') return 'win';
    if (forced === 'bust') return 'bust';
    if (row && (row.folded || row.sittingOut)) return 'fold';
    if (forced === 'fold') return 'fold';
    if (forced) return forced;
    const action = latestActionKind(state, seat.id);
    if (action === 'fold') return 'fold';
    if (action) return action;
    return '';
  }

  function updateTags(state, winnerIds) {
    const winners = winnerIds instanceof Set ? winnerIds : new Set(winnerIds || []);
    latestState = state || null;
    latestWinners = winners;
    const handChanged = state?.handNumber != null && seenHand != null && state.handNumber !== seenHand;
    if (handChanged) {
      for (const [id, entry] of manualEmote) {
        if (!entry.fresh) manualEmote.delete(id);
      }
    }
    for (const entry of manualEmote.values()) entry.fresh = false;
    if (state?.handNumber != null) seenHand = state.handNumber;
    for (const seat of seats) {
      const row = state?.seats?.find((item) => item.id === seat.id);
      const stack = row ? row.stack : '';
      paintTag(seat.tag, row?.name || seat.name, stack, seat.color, Boolean(row?.isActor));
      seat.ring.visible = Boolean(row?.isActor);
      paintEmote(seat.emote, reactionFor(seat, row, winners, state));
      applyFlyFade(seat.fly, flyMeshFaded(row, Boolean(state?.handLive)));
    }
  }

  function setFlyEmote(id, kind) {
    const next = emoteKind(kind);
    if (!next) manualEmote.delete(id);
    else manualEmote.set(id, { kind: next, fresh: true });
    if (latestState) updateTags(latestState, latestWinners);
    else {
      const seat = seats.find((item) => item.id === id);
      if (seat) paintEmote(seat.emote, next);
    }
  }

  function tick(time) {
    const flapTime = time * 0.001;
    for (const seat of seats) {
      const flap = Math.sin(flapTime * 14 + seat.fly.phase) * 0.16;
      seat.fly.wings.forEach((wing, index) => {
        wing.rotation.z = seat.fly.wingBases[index] + flap * (index === 0 ? 1 : -1);
      });
      const emote = seat.emote;
      if (!emote.sprite.visible) continue;
      const wild = emote.kind === 'fold' ? 1 : 0.4;
      emote.sprite.rotation.z = Math.sin(flapTime * 2.4 + seat.fly.phase) * 0.2 * wild;
      emote.sprite.position.y = emote.baseY + Math.sin(flapTime * 3.1 + seat.fly.phase) * 0.02 * wild;
    }
  }

  faceTable();
  const cast = {
    seats,
    dealer: { pivot: dealerPivot, group: beetle },
    faceTable,
    updateTags,
    setFlyEmote,
    tick,
    pickables: () => seats.map((seat) => seat.pivot),
  };
  activeCast = cast;
  return cast;
}

let activeCast = null;

/** main.js can force a face. Folded and won from updateTags still take priority. */
export function setFlyEmote(id, kind) {
  activeCast?.setFlyEmote(id, kind);
}
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
