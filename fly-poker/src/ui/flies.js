/** Chunky seated flies and the beetle dealer. All meshes are primitives. */

import * as THREE from 'three';
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
  const zHip = [0.14, 0.0, -0.12][index];
  const zFoot = [0.2, 0.02, -0.28][index];
  const out = 0.1 + index * 0.02;
  const hip = new THREE.Vector3(side * 0.12, 0.28, zHip);
  const knee = new THREE.Vector3(side * (0.22 + out), 0.14, (zHip + zFoot) * 0.5);
  const foot = new THREE.Vector3(side * (0.1 + out), 0.03, zFoot);
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
