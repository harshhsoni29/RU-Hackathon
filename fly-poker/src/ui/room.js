/** Enclosed poker den: carpet, velvet, wood, bar, lounge, cage, neon. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bindThree } from './textures.js';
import {
  artTexture,
  carpetTexture,
  feltTexture,
  rulesTexture,
  velvetTexture,
  woodTexture,
} from './textures.js';

/** Wide oval. The spectator stands on the near rail (+Z) and looks across. */
export const ROOM = { halfW: 8.4, halfD: 7.6, height: 3.3 };

export const TABLE = {
  x: 0,
  z: 0,
  top: 0.78,
  feltRx: 4.9,
  feltRz: 3.6,
  apronRx: 5.15,
  apronRz: 3.82,
};

export const SEAT = { rx: 6.3, rz: 5.0 };

/** Dealer takes the left end. Flies leave a gap at +Z for the rail camera. */
export const DEALER_ANGLE = Math.PI;
export const SEATS = [
  { id: 'vera', angle: (240 * Math.PI) / 180 },
  { id: 'buzz', angle: (300 * Math.PI) / 180 },
  { id: 'nib', angle: 0 },
  { id: 'callie', angle: (60 * Math.PI) / 180 },
  { id: 'mani', angle: (120 * Math.PI) / 180 },
];

export function ovalPoint(angle, rx, rz, origin = TABLE) {
  return {
    x: origin.x + Math.cos(angle) * rx,
    y: 0,
    z: origin.z + Math.sin(angle) * rz,
  };
}

function shade(mesh, cast = false) {
  mesh.castShadow = cast;
  mesh.receiveShadow = false;
  return mesh;
}

/** Floor, felt, and the table. Everything else skips the spotlight shadow tap. */
function stage(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, mat, x, y, z) {
  const mesh = shade(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  mesh.position.set(x, y, z);
  return mesh;
}

export function createMaterials() {
  const woodMap = woodTexture();
  const velvetMap = velvetTexture();
  const carpetMap = carpetTexture();
  const feltMap = feltTexture();
  return {
    wood: new THREE.MeshStandardMaterial({ map: woodMap, color: 0xffffff, roughness: 0.72, metalness: 0.04 }),
    woodDark: new THREE.MeshStandardMaterial({ map: woodMap, color: 0x6a5038, roughness: 0.8 }),
    // Matte surfaces. Lambert still takes the sconce and spot lights, without a GGX loop per light.
    velvet: new THREE.MeshLambertMaterial({ map: velvetMap, color: 0xffffff }),
    carpet: new THREE.MeshLambertMaterial({ map: carpetMap, color: 0xffffff }),
    felt: new THREE.MeshLambertMaterial({ map: feltMap, color: 0xffffff }),
    leather: new THREE.MeshStandardMaterial({ color: 0x3a2218, roughness: 0.62, metalness: 0.05 }),
    leatherDark: new THREE.MeshStandardMaterial({ color: 0x24140e, roughness: 0.7 }),
    // Off the table. Lambert skips the GGX loop the sconces would run on these big surfaces.
    woodMatte: new THREE.MeshLambertMaterial({ map: woodMap, color: 0xffffff }),
    woodDarkMatte: new THREE.MeshLambertMaterial({ map: woodMap, color: 0x6a5038 }),
    leatherMatte: new THREE.MeshLambertMaterial({ color: 0x3a2218 }),
    leatherDarkMatte: new THREE.MeshLambertMaterial({ color: 0x24140e }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd4b06a, metalness: 0.82, roughness: 0.28 }),
    neon: new THREE.MeshLambertMaterial({
      color: 0xffd0d6,
      emissive: 0xff2244,
      emissiveIntensity: 2.4,
      toneMapped: false,
    }),
    bulb: new THREE.MeshStandardMaterial({
      color: 0xfff1d2,
      emissive: 0xffb15a,
      emissiveIntensity: 3,
      toneMapped: false,
    }),
    shade: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.7, side: THREE.DoubleSide }),
    bottleAmber: new THREE.MeshStandardMaterial({
      color: 0xc47a22,
      transparent: true,
      opacity: 0.82,
      roughness: 0.15,
    }),
    bottleGreen: new THREE.MeshStandardMaterial({
      color: 0x1f6a3a,
      transparent: true,
      opacity: 0.8,
      roughness: 0.15,
    }),
    rug: new THREE.MeshLambertMaterial({ color: 0x4a1520 }),
    chipRed: new THREE.MeshStandardMaterial({ color: 0xc73a3a, roughness: 0.45 }),
    chipBlue: new THREE.MeshStandardMaterial({ color: 0x2a5bd7, roughness: 0.45 }),
    chipGreen: new THREE.MeshStandardMaterial({ color: 0x1f8a4a, roughness: 0.45 }),
    chipBlack: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }),
    chipGold: new THREE.MeshStandardMaterial({ color: 0xe6c15a, metalness: 0.4, roughness: 0.4 }),
  };
}

function addShell(parent, mats) {
  const { halfW, halfD, height } = ROOM;
  const floor = stage(new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfD * 2), mats.carpet), false);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  parent.add(floor);

  const ceiling = shade(new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, halfD * 2),
    new THREE.MeshLambertMaterial({ color: 0x1a120e }),
  ), false);
  ceiling.receiveShadow = false;
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  parent.add(ceiling);

  const wallGeoNS = new THREE.PlaneGeometry(halfW * 2, height);
  const wallGeoEW = new THREE.PlaneGeometry(halfD * 2, height);
  const far = shade(new THREE.Mesh(wallGeoNS, mats.velvet), false);
  far.position.set(0, height / 2, -halfD);
  const near = shade(new THREE.Mesh(wallGeoNS, mats.velvet), false);
  near.position.set(0, height / 2, halfD);
  near.rotation.y = Math.PI;
  const left = shade(new THREE.Mesh(wallGeoEW, mats.velvet), false);
  left.position.set(-halfW, height / 2, 0);
  left.rotation.y = Math.PI / 2;
  const right = shade(new THREE.Mesh(wallGeoEW, mats.velvet), false);
  right.position.set(halfW, height / 2, 0);
  right.rotation.y = -Math.PI / 2;
  // Sconce lights stay in the scene. Walls do not need the spotlight shadow tap.
  far.receiveShadow = false;
  near.receiveShadow = false;
  left.receiveShadow = false;
  right.receiveShadow = false;
  parent.add(far, near, left, right);
}

function addTrim(parent, mats) {
  const { halfW, halfD, height } = ROOM;
  const railY = 1.15;
  const t = 0.08;
  parent.add(box(halfW * 2, railY, t, mats.woodDarkMatte, 0, railY / 2, -halfD + t / 2));
  parent.add(box(halfW * 2, railY, t, mats.woodDarkMatte, 0, railY / 2, halfD - t / 2));
  parent.add(box(t, railY, halfD * 2, mats.woodDarkMatte, -halfW + t / 2, railY / 2, 0));
  parent.add(box(t, railY, halfD * 2, mats.woodDarkMatte, halfW - t / 2, railY / 2, 0));
  parent.add(box(halfW * 2, 0.08, 0.1, mats.woodMatte, 0, railY, -halfD + 0.08));
  parent.add(box(halfW * 2, 0.08, 0.1, mats.woodMatte, 0, railY, halfD - 0.08));
  parent.add(box(0.1, 0.08, halfD * 2, mats.woodMatte, -halfW + 0.08, railY, 0));
  parent.add(box(0.1, 0.08, halfD * 2, mats.woodMatte, halfW - 0.08, railY, 0));
  parent.add(box(halfW * 2, 0.1, 0.16, mats.woodDarkMatte, 0, height - 0.05, -halfD + 0.06));
}

function addPicture(parent, mats, x, y, z, ry, kind) {
  const frame = box(0.92, 0.92, 0.05, mats.woodMatte, x, y, z);
  frame.rotation.y = ry;
  const art = shade(new THREE.Mesh(
    new THREE.PlaneGeometry(0.74, 0.74),
    new THREE.MeshLambertMaterial({ map: kind === 'rules' ? rulesTexture() : artTexture(kind) }),
  ), false);
  const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  art.position.set(x, y, z).addScaledVector(normal, 0.04);
  art.rotation.y = ry;
  parent.add(frame, art);
}

function chipStack(mats, n, x, y, z) {
  const colors = [mats.chipRed, mats.chipBlue, mats.chipGreen, mats.chipBlack, mats.chipGold];
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.09, 0.09, 0.028, 10);
  for (let i = 0; i < n; i++) {
    const chip = new THREE.Mesh(geo, colors[i % colors.length]);
    chip.castShadow = false;
    chip.receiveShadow = false;
    chip.position.set(x, y + i * 0.03, z);
    group.add(chip);
  }
  return group;
}

function bottle(mats, x, y, z, kind) {
  const mat = kind === 'green' ? mats.bottleGreen : mats.bottleAmber;
  const body = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.28, 8), mat));
  body.position.set(x, y + 0.14, z);
  const neck = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.1, 6), mat));
  neck.position.set(x, y + 0.32, z);
  const cap = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 6), mats.brass));
  cap.position.set(x, y + 0.38, z);
  return [body, neck, cap];
}

function addBar(parent, mats) {
  const z = -ROOM.halfD + 0.48;
  parent.add(box(3.15, 0.12, 0.55, mats.woodMatte, 1.15, 1.02, z));
  parent.add(box(3.15, 0.9, 0.48, mats.woodDarkMatte, 1.15, 0.45, z - 0.02));
  parent.add(box(3.2, 0.04, 0.06, mats.brass, 1.15, 0.72, z + 0.28));

  const shelf = box(2.4, 0.06, 0.22, mats.woodMatte, 1.2, 1.85, -ROOM.halfD + 0.2);
  parent.add(shelf);
  parent.add(box(2.4, 0.06, 0.22, mats.woodMatte, 1.2, 2.35, -ROOM.halfD + 0.2));

  for (let i = 0; i < 5; i++) {
    const x = -0.15 + i * 0.55;
    parent.add(...bottle(mats, x, 1.08, z - 0.02, i % 2 ? 'green' : 'amber'));
    parent.add(...bottle(mats, x + 0.16, 1.91, -ROOM.halfD + 0.2, i % 2 ? 'amber' : 'green'));
  }

  for (let i = 0; i < 3; i++) {
    const x = 0.15 + i * 0.85;
    const stool = new THREE.Group();
    const pole = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.7, 6), mats.brass));
    pole.position.y = 0.35;
    const seat = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.07, 10), mats.leatherMatte));
    seat.position.y = 0.72;
    const foot = shade(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 12), mats.brass));
    foot.rotation.x = Math.PI / 2;
    foot.position.y = 0.28;
    stool.add(pole, seat, foot);
    stool.position.set(x, 0, z + 0.55);
    parent.add(stool);
  }
}

function addLounge(parent, mats) {
  const x = -6.7;
  const z = -6.15;
  parent.add(box(1.5, 0.28, 0.62, mats.leatherMatte, x, 0.32, z));
  parent.add(box(1.5, 0.55, 0.14, mats.leatherDarkMatte, x, 0.7, z + 0.24));
  parent.add(box(0.14, 0.4, 0.62, mats.leatherDarkMatte, x - 0.68, 0.55, z));
  parent.add(box(0.14, 0.4, 0.62, mats.leatherDarkMatte, x + 0.68, 0.55, z));
  const table = box(0.7, 0.08, 0.45, mats.woodMatte, x, 0.42, z - 0.7);
  parent.add(table);
  parent.add(box(0.06, 0.38, 0.06, mats.woodDarkMatte, x - 0.28, 0.2, z - 0.86));
  parent.add(box(0.06, 0.38, 0.06, mats.woodDarkMatte, x + 0.28, 0.2, z - 0.86));
  parent.add(chipStack(mats, 6, x, 0.5, z - 0.7));
}

function addCage(parent, mats) {
  const x = -ROOM.halfW + 0.7;
  const z = 0.4;
  parent.add(box(0.7, 0.08, 1.15, mats.woodMatte, x, 0.85, z));
  parent.add(box(0.08, 0.85, 0.08, mats.woodDarkMatte, x - 0.28, 0.42, z - 0.5));
  parent.add(box(0.08, 0.85, 0.08, mats.woodDarkMatte, x + 0.28, 0.42, z - 0.5));
  parent.add(box(0.08, 0.85, 0.08, mats.woodDarkMatte, x - 0.28, 0.42, z + 0.5));
  parent.add(box(0.08, 0.85, 0.08, mats.woodDarkMatte, x + 0.28, 0.42, z + 0.5));
  const barMat = mats.brass;
  for (let i = 0; i < 4; i++) {
    parent.add(box(0.025, 0.7, 0.025, barMat, x - 0.22 + i * 0.15, 1.25, z - 0.48));
    parent.add(box(0.025, 0.7, 0.025, barMat, x - 0.22 + i * 0.15, 1.25, z + 0.48));
  }
  parent.add(box(0.62, 0.025, 0.025, barMat, x, 1.55, z - 0.48));
  parent.add(box(0.62, 0.025, 0.025, barMat, x, 1.55, z + 0.48));
  parent.add(chipStack(mats, 10, x - 0.16, 0.92, z - 0.2));
  parent.add(chipStack(mats, 8, x + 0.16, 0.92, z));
  parent.add(chipStack(mats, 12, x, 0.92, z + 0.25));
}

function addNeon(parent, mats) {
  const z = -ROOM.halfD + 0.1;
  const board = box(2.05, 0.48, 0.06, mats.woodDarkMatte, -1.55, 2.58, z);
  parent.add(board);
  const letters = new THREE.Group();
  const cell = 0.34;
  const glyphs = ['H', 'O', 'L', 'D', "'", 'E', 'M'];
  glyphs.forEach((glyph, i) => {
    const x = (i - (glyphs.length - 1) / 2) * cell;
    addGlyph(letters, mats.neon, glyph, x);
  });
  letters.position.set(-1.55, 2.58, z + 0.07);
  letters.scale.setScalar(0.62);
  parent.add(letters);
}

function addGlyph(parent, mat, glyph, x) {
  const z = 0;
  const add = (w, h, px, py) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.045), mat);
    mesh.position.set(x + px, py, z);
    parent.add(mesh);
  };
  if (glyph === 'H') {
    add(0.045, 0.42, -0.1, 0);
    add(0.045, 0.42, 0.1, 0);
    add(0.2, 0.045, 0, 0);
  } else if (glyph === 'O') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.028, 6, 10), mat);
    ring.position.set(x, 0, z);
    parent.add(ring);
  } else if (glyph === 'L') {
    add(0.045, 0.42, -0.08, 0);
    add(0.18, 0.045, 0.02, -0.18);
  } else if (glyph === 'D') {
    add(0.045, 0.42, -0.09, 0);
    add(0.16, 0.045, 0.0, 0.18);
    add(0.16, 0.045, 0.0, -0.18);
    add(0.045, 0.32, 0.1, 0);
  } else if (glyph === "'") {
    add(0.04, 0.1, 0, 0.16);
  } else if (glyph === 'E') {
    add(0.045, 0.42, -0.09, 0);
    add(0.18, 0.04, 0.0, 0.18);
    add(0.15, 0.04, -0.01, 0);
    add(0.18, 0.04, 0.0, -0.18);
  } else if (glyph === 'M') {
    add(0.04, 0.42, -0.11, 0);
    add(0.04, 0.42, 0.11, 0);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.04), mat);
    left.position.set(x - 0.05, 0.08, z);
    left.rotation.z = 0.45;
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.04), mat);
    right.position.set(x + 0.05, 0.08, z);
    right.rotation.z = -0.45;
    parent.add(left, right);
  }
}

function addDoor(parent, mats) {
  const z = ROOM.halfD - 0.06;
  parent.add(box(0.95, 2.15, 0.08, mats.woodDarkMatte, -2.15, 1.08, z));
  const panel = box(0.72, 1.85, 0.04, mats.woodMatte, -2.15, 1.05, z + 0.02);
  parent.add(panel);
  const knob = shade(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), mats.brass));
  knob.position.set(-1.88, 1.02, z + 0.08);
  parent.add(knob);
}

function addHeroLamp(parent, mats) {
  const g = new THREE.Group();
  g.position.set(TABLE.x, ROOM.height, TABLE.z);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 6), mats.woodDark);
  cord.position.y = -0.35;
  const cap = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8), mats.brass));
  cap.position.y = -0.72;
  const shadeMesh = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 0.26, 8), mats.shade));
  shadeMesh.position.y = -0.86;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mats.bulb);
  bulb.position.y = -0.98;
  g.add(cord, cap, shadeMesh, bulb);
  parent.add(g);

  const spot = new THREE.SpotLight(0xffc48a, 4, 14, 1.05, 0.8, 1.1);
  spot.position.set(TABLE.x, ROOM.height - 1.15, TABLE.z);
  spot.target.position.set(TABLE.x, TABLE.top, TABLE.z);
  spot.castShadow = true;
  spot.shadow.mapSize.set(512, 512);
  spot.shadow.camera.near = 0.4;
  spot.shadow.camera.far = 6;
  spot.shadow.bias = -0.0015;
  parent.add(spot);
  parent.add(spot.target);

  return { spot, bulb };
}

function addSconce(parent, mats, x, y, z, ry) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const arm = shade(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.22), mats.brass));
  arm.position.z = 0.1;
  const cup = shade(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 7), mats.shade));
  cup.position.set(0, -0.02, 0.22);
  cup.rotation.x = Math.PI;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mats.bulb);
  bulb.position.set(0, -0.02, 0.22);
  const glow = new THREE.PointLight(0xffb066, 6, 6.5, 2);
  glow.position.set(0, -0.02, 0.36);
  glow.castShadow = false;
  g.add(arm, cup, bulb, glow);
  parent.add(g);
}

export function buildRoom(scene, mats) {
  const root = new THREE.Group();
  scene.add(root);
  addShell(root, mats);
  addTrim(root, mats);
  addBar(root, mats);
  addLounge(root, mats);
  addCage(root, mats);
  addPicture(root, mats, -2.3, 2.15, -ROOM.halfD + 0.08, 0, 'suits');
  addPicture(root, mats, 2.8, 2.2, -ROOM.halfD + 0.08, 0, 'house');
  addPicture(root, mats, ROOM.halfW - 0.08, 2.05, 0.2, -Math.PI / 2, 'house');
  addPicture(root, mats, ROOM.halfW - 0.08, 2.15, -2.4, -Math.PI / 2, 'suits');
  addPicture(root, mats, -ROOM.halfW + 0.08, 1.9, 2.1, Math.PI / 2, 'rules');
  addPicture(root, mats, -ROOM.halfW + 0.08, 2.2, -2.2, Math.PI / 2, 'suits');
  addNeon(root, mats);
  addDoor(root, mats);
  const lamp = addHeroLamp(root, mats);
  addSconce(root, mats, -ROOM.halfW + 0.08, 2.05, -0.4, Math.PI / 2);
  addSconce(root, mats, -ROOM.halfW + 0.08, 2.05, 4.3, Math.PI / 2);
  addSconce(root, mats, ROOM.halfW - 0.08, 2.05, 1.6, -Math.PI / 2);
  addSconce(root, mats, ROOM.halfW - 0.08, 2.05, -4.6, -Math.PI / 2);
  addSconce(root, mats, -5.2, 2.15, -ROOM.halfD + 0.12, 0);
  addSconce(root, mats, 5.4, 2.15, -ROOM.halfD + 0.12, 0);
  addTable(root, mats);
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    obj.matrixAutoUpdate = false;
  });
  return lamp;
}

function addTable(parent, mats) {
  const foot = stage(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.08, 14), mats.woodDark));
  foot.position.set(TABLE.x, 0.04, TABLE.z);
  const post = stage(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.5, 10), mats.woodDark));
  post.position.set(TABLE.x, 0.3, TABLE.z);
  const apron = stage(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.18, 40), mats.wood));
  apron.scale.set(TABLE.apronRx, 1, TABLE.apronRz);
  apron.position.set(TABLE.x, TABLE.top - 0.14, TABLE.z);
  const felt = stage(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 48), mats.felt), false);
  felt.scale.set(TABLE.feltRx, 1, TABLE.feltRz);
  felt.position.set(TABLE.x, TABLE.top, TABLE.z);
  const rail = stage(new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 40), mats.leather));
  rail.rotation.x = Math.PI / 2;
  rail.scale.set(TABLE.feltRx + 0.1, TABLE.feltRz + 0.08, 1);
  rail.position.set(TABLE.x, TABLE.top + 0.02, TABLE.z);
  const rug = stage(new THREE.Mesh(new THREE.CircleGeometry(1, 40), mats.rug), false);
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(6.4, 5.2, 1);
  rug.position.set(TABLE.x, 0.012, TABLE.z);
  const curve = new THREE.EllipseCurve(0, 0, TABLE.feltRx * 0.82, TABLE.feltRz * 0.72, 0, Math.PI * 2, false, 0);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(72).map((p) => new THREE.Vector3(TABLE.x + p.x, TABLE.top + 0.035, TABLE.z + p.y))),
    new THREE.LineBasicMaterial({ color: 0xe6d2a2, transparent: true, opacity: 0.4 }),
  );
  parent.add(foot, post, apron, felt, rail, rug, line);
}

/** Deck sits on the felt at the dealer's end. Board and pot stay on the felt. */
export function tableAnchors() {
  const deck = ovalPoint(DEALER_ANGLE, TABLE.feltRx * 0.62, TABLE.feltRz * 0.55);
  deck.y = TABLE.top + 0.02;
  return {
    deck,
    board: { x: TABLE.x, y: TABLE.top + 0.02, z: TABLE.z + 0.02 },
    pot: { x: TABLE.x, y: TABLE.top + 0.02, z: TABLE.z + 0.42 },
  };
}

export function createRailView(canvas) {
  bindThree(THREE);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  // Retina at 2x is four times the fragments. 1.5 keeps the table sharp enough.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  // Hardware PCF is one shadow tap. Soft PCF re-samples every lit fragment.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // The lamp, flies, and furniture do not move. One shadow pass is enough.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.setClearColor(0x120c09);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x140e0b, 8, 16);
  scene.add(new THREE.AmbientLight(0xffe2c4, 0.85));
  scene.add(new THREE.HemisphereLight(0xffc9a0, 0x2a120e, 0.95));
  const fill = new THREE.DirectionalLight(0xffd8b0, 1.35);
  fill.position.set(0.4, 2.8, 4.2);
  scene.add(fill);

  const mats = createMaterials();
  const lamp = buildRoom(scene, mats);
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    obj.matrixAutoUpdate = false;
  });
  scene.matrixAutoUpdate = false;
  const camera = new THREE.PerspectiveCamera(56, 1, 0.08, 40);
  camera.position.set(0, 5.6, TABLE.z + 7.5);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(TABLE.x, 0.9, TABLE.z + 0.2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3.6;
  controls.maxDistance = 12;
  controls.minPolarAngle = 0.45;
  controls.maxPolarAngle = 1.28;
  controls.update();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  return { renderer, scene, camera, controls, mats, lamp, anchors: tableAnchors(), resize };
}

export function chipMaterials(mats) {
  return [mats.chipRed, mats.chipBlue, mats.chipGreen, mats.chipBlack, mats.chipGold];
}
