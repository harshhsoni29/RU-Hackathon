/** Table, chairs, dealer, cards, and an orbit camera inside the room. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bindThree } from './textures.js';
import { plaqueTexture } from './textures.js';
import { createFly, createBeetle } from './flies.js';
import { createCardMesh, showCard } from './cards.js';
import { buildRoom, chipMaterials, createMaterials } from './room.js';
import { DEALER_ANGLE, ROOM, SEAT, SEATS, TABLE, insideFelt, oval } from './layout.js';

const _look = new THREE.Object3D();

function shade(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function yawToward(x, z) {
  _look.position.set(x, 0, z);
  _look.lookAt(TABLE.x, 0, TABLE.z);
  // Object3D.lookAt aims +Z at the target. Flies and Chip face -Z.
  return _look.rotation.y + Math.PI;
}

function makeChair(mats, cushionColor) {
  const g = new THREE.Group();
  const legGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.46, 6);
  for (const [x, z] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) {
    const leg = shade(new THREE.Mesh(legGeo, mats.woodDark));
    leg.position.set(x, 0.23, z);
    g.add(leg);
  }
  const cushionMat = new THREE.MeshStandardMaterial({
    color: cushionColor.clone().lerp(new THREE.Color(0x2a140e), 0.55),
    roughness: 0.6,
    emissive: cushionColor,
    emissiveIntensity: 0,
  });
  const seat = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 12), cushionMat));
  seat.position.y = 0.48;
  const back = shade(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.07), mats.wood));
  back.position.set(0, 0.78, 0.22);
  g.add(seat, back);
  return { group: g, cushion: cushionMat };
}

function makeStack(colors, count, x, y, z) {
  const g = new THREE.Group();
  const n = Math.max(0, Math.min(12, count));
  const geo = new THREE.CylinderGeometry(0.055, 0.055, 0.024, 10);
  for (let i = 0; i < n; i++) {
    const chip = shade(new THREE.Mesh(geo, colors[i % colors.length]));
    chip.position.set(x, y + 0.02 + i * 0.028, z);
    g.add(chip);
  }
  return g;
}

function makeSprite(text, accent) {
  const mat = new THREE.SpriteMaterial({
    map: plaqueTexture(text, accent),
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.42, 0.105, 1);
  return sprite;
}

function feltPoint(angle, scale) {
  return oval(angle, TABLE.feltRx * scale, TABLE.feltRz * scale);
}

export function createView(canvas, roster) {
  bindThree(THREE);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x120c09);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x140e0b, 7.5, 13);
  scene.add(new THREE.AmbientLight(0xffe2c4, 0.28));
  scene.add(new THREE.HemisphereLight(0xffc9a0, 0x2a120e, 0.42));
  const fill = new THREE.DirectionalLight(0xffd8b0, 0.7);
  fill.position.set(1.2, 2.6, 4.2);
  scene.add(fill);

  const mats = createMaterials();
  const lamp = buildRoom(scene, mats);
  const colors = chipMaterials(mats);

  buildTable(scene, mats);
  const deck = buildDeckShoe(scene, mats);
  const beetle = placeDealer(scene, mats);
  const seats = placeFlies(scene, mats, roster);
  const board = Array.from({ length: 5 }, () => {
    const mesh = createCardMesh();
    scene.add(mesh);
    return mesh;
  });
  const potGroup = new THREE.Group();
  scene.add(potGroup);
  const potLabel = makeSprite('POT', '#e6c27a');
  potLabel.position.set(TABLE.x, TABLE.top + 0.55, TABLE.z - 0.42);
  scene.add(potLabel);

  const button = token(mats, 'D', 0xf4efe4, 0x222222);
  const smallBlind = token(mats, 'S', 0x4aa3e8, 0xffffff);
  const bigBlind = token(mats, 'B', 0xd4b06a, 0x22180e);
  scene.add(button, smallBlind, bigBlind);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, 40);
  const mani = seats.find((s) => s.id === 'mani');
  camera.position.set(mani.anchor.x + 1.15, 1.92, mani.anchor.z + 1.55);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(TABLE.x, 0.92, TABLE.z - 0.15);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.72;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.55;
  controls.minDistance = 1.25;
  controls.maxDistance = 5.4;
  controls.minPolarAngle = 0.42;
  controls.maxPolarAngle = 1.48;
  controls.update();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let selectedId = null;
  let actorId = null;
  let running = false;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const roots = seats.map((s) => s.fly.group);
    const hits = raycaster.intersectObjects(roots, true);
    if (!hits.length) return null;
    let node = hits[0].object;
    while (node && !node.userData.flyId) node = node.parent;
    return node ? node.userData.flyId : null;
  }

  function setSelected(id) {
    selectedId = id;
    for (const seat of seats) {
      seat.ring.material.emissiveIntensity = seat.id === id ? 0.55 : 0.08;
    }
  }

  function setState(state) {
    const byId = new Map((state.seats || []).map((s) => [s.id, s]));
    actorId = state.actorId || null;
    (state.board || []).forEach((card, i) => {
      const mesh = board[i];
      showCard(mesh, card);
      if (!card) return;
      const x = TABLE.x + (i - 2) * 0.3;
      mesh.position.set(x, TABLE.top + 0.2, TABLE.z + 0.02);
      mesh.rotation.set(0, 0, 0);
      mesh.rotateX(0.7);
    });
    for (let i = (state.board || []).length; i < board.length; i++) board[i].visible = false;

    for (const seat of seats) {
      const info = byId.get(seat.id);
      if (!info) continue;
      const dim = info.folded || info.sittingOut;
      for (const part of seat.fly.toned) {
        part.mat.color.copy(part.base);
        if (dim) part.mat.color.multiplyScalar(0.42);
      }
      const acting = info.isActor;
      seat.cushion.emissiveIntensity = acting ? 0.55 : seat.id === selectedId ? 0.2 : 0;
      seat.ring.material.color.set(info.color || 0xe6c27a);
      seat.ring.material.emissive.set(info.color || 0xe6c27a);
      const holes = info.holeCards || [];
      holes.forEach((card, i) => {
        const mesh = seat.holes[i];
        showCard(mesh, card, { folded: info.folded });
        if (!card || info.sittingOut) {
          mesh.visible = false;
          return;
        }
        const p = feltPoint(seat.angle, 0.74);
        const tangent = new THREE.Vector3(-Math.sin(seat.angle), 0, Math.cos(seat.angle));
        const side = i === 0 ? -1 : 1;
        mesh.position.set(
          p.x + tangent.x * side * 0.14,
          TABLE.top + (info.folded ? 0.12 : 0.2),
          p.z + tangent.z * side * 0.14,
        );
        mesh.rotation.set(0, Math.PI / 2 - seat.angle, 0);
        mesh.rotateX(info.folded ? 0.25 : 0.68);
      });
      for (let i = holes.length; i < 2; i++) seat.holes[i].visible = false;

      const stackN = info.sittingOut ? 0 : Math.max(1, Math.round((info.stack || 0) / 220));
      clearGroup(seat.stackGroup);
      const sp = feltPoint(seat.angle, 0.9);
      seat.stackGroup.add(makeStack(colors, Math.min(stackN, 10), sp.x, TABLE.top, sp.z));
      const bet = info.bet || 0;
      clearGroup(seat.betGroup);
      if (bet > 0) {
        const bp = feltPoint(seat.angle, 0.48);
        seat.betGroup.add(makeStack(colors, Math.max(1, Math.min(6, Math.round(bet / 20))), bp.x, TABLE.top, bp.z));
      }

      const tag = acting ? `${info.name} · act` : info.name;
      const accent = `#${(info.color >>> 0).toString(16).padStart(6, '0')}`;
      if (seat.labelKey !== tag) {
        seat.label.material.map.dispose();
        seat.label.material.map = plaqueTexture(tag, accent);
        seat.label.material.needsUpdate = true;
        seat.labelKey = tag;
      }
    }

    clearGroup(potGroup);
    const pot = state.pot || 0;
    if (pot > 0) {
      const n = Math.max(2, Math.min(12, Math.round(pot / 25)));
      potGroup.add(makeStack(colors, n, TABLE.x, TABLE.top, TABLE.z - 0.4));
    }
    potLabel.visible = pot > 0;
    const potText = pot > 0 ? `POT ${pot}` : '';
    if (pot > 0 && potLabel.userData.text !== potText) {
      potLabel.material.map.dispose();
      potLabel.material.map = plaqueTexture(potText, '#e6c27a');
      potLabel.material.needsUpdate = true;
      potLabel.userData.text = potText;
    }

    placeToken(button, state, 'isButton', 0.96);
    placeToken(smallBlind, state, 'isSmallBlind', 0.84);
    placeToken(bigBlind, state, 'isBigBlind', 0.84);
    deck.visible = true;
  }

  function animate(time) {
    if (!running) return;
    const t = time * 0.001;
    controls.update();
    keepInside();
    for (const seat of seats) {
      const flap = Math.sin(t * 6.5 + seat.fly.phase) * 0.16;
      seat.fly.wings[0].rotation.z = seat.fly.wingBases[0] + flap;
      seat.fly.wings[1].rotation.z = seat.fly.wingBases[1] - flap;
      const hot = seat.id === actorId;
      seat.fly.eyeMat.emissiveIntensity = hot ? 0.7 + Math.sin(t * 5) * 0.25 : 0.3;
      seat.ring.scale.setScalar(hot ? 1 + Math.sin(t * 4) * 0.04 : 1);
    }
    lamp.bulb.material.emissiveIntensity = 2.6 + Math.sin(t * 1.6) * 0.25;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  function keepInside() {
    const m = 0.28;
    camera.position.x = clamp(camera.position.x, -ROOM.halfW + m, ROOM.halfW - m);
    camera.position.z = clamp(camera.position.z, -ROOM.halfD + m, ROOM.halfD - m);
    camera.position.y = clamp(camera.position.y, 0.4, ROOM.height - 0.2);
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    requestAnimationFrame(animate);
  }

  warnIfInsideFelt(seats, beetle);

  return { setState, pick, setSelected, resize, start, seats };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function clearGroup(group) {
  const geos = new Set();
  group.traverse((obj) => {
    if (obj.geometry) geos.add(obj.geometry);
  });
  group.clear();
  for (const geo of geos) geo.dispose();
}

function buildTable(scene, mats) {
  const foot = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.55, 0.08, 12), mats.woodDark));
  foot.position.set(TABLE.x, 0.04, TABLE.z);
  const post = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 10), mats.woodDark));
  post.position.set(TABLE.x, 0.32, TABLE.z);
  const apron = shade(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.18, 32), mats.wood));
  apron.scale.set(TABLE.apronRx, 1, TABLE.apronRz);
  apron.position.set(TABLE.x, TABLE.top - 0.14, TABLE.z);
  const felt = shade(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 40), mats.felt), false);
  felt.scale.set(TABLE.feltRx, 1, TABLE.feltRz);
  felt.position.set(TABLE.x, TABLE.top, TABLE.z);
  const rail = shade(new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 8, 32), mats.leather));
  rail.rotation.x = Math.PI / 2;
  rail.scale.set(TABLE.feltRx + 0.08, TABLE.feltRz + 0.06, 1);
  rail.position.set(TABLE.x, TABLE.top + 0.02, TABLE.z);
  const rug = shade(new THREE.Mesh(new THREE.CircleGeometry(1, 36), mats.rug), false);
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(2.7, 2.15, 1);
  rug.position.set(TABLE.x, 0.012, TABLE.z);

  const curve = new THREE.EllipseCurve(0, 0, TABLE.feltRx * 0.78, TABLE.feltRz * 0.72, 0, Math.PI * 2, false, 0);
  const pts = curve.getPoints(64).map((p) => new THREE.Vector3(TABLE.x + p.x, TABLE.top + 0.03, TABLE.z + p.y));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xe6d2a2, transparent: true, opacity: 0.45 }),
  );
  scene.add(foot, post, apron, felt, rail, rug, line);
}

function buildDeckShoe(scene, mats) {
  const g = new THREE.Group();
  const body = shade(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.2), mats.woodDark));
  body.position.y = 0.08;
  g.add(body);
  for (let i = 0; i < 7; i++) {
    const card = shade(new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.012, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x1a3d32, roughness: 0.5 }),
    ));
    card.position.set(0, 0.18 + i * 0.012, -0.01);
    card.rotation.z = -0.18;
    g.add(card);
  }
  g.position.set(TABLE.x + 0.42, TABLE.top, TABLE.z - 0.55);
  g.rotation.y = -0.4;
  scene.add(g);
  return g;
}

function placeDealer(scene) {
  const pos = oval(DEALER_ANGLE, 1.05, 1.82);
  pos.x -= 0.32;
  const stand = new THREE.Group();
  const step = shade(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.52), new THREE.MeshStandardMaterial({
    color: 0x3a2416,
    roughness: 0.7,
  })));
  step.position.y = 0.21;
  stand.add(step);
  const beetle = createBeetle();
  beetle.position.y = 0.42;
  stand.add(beetle);
  stand.position.set(pos.x, 0, pos.z);
  stand.rotation.y = yawToward(pos.x, pos.z);
  const name = makeSprite('Chip', '#d4b06a');
  name.position.set(0, 1.62, 0);
  stand.add(name);
  scene.add(stand);
  return { group: stand, pos };
}

function placeFlies(scene, mats, roster) {
  const byId = new Map(roster.map((fly) => [fly.id, fly]));
  return SEATS.map((slot) => {
    const meta = byId.get(slot.id);
    const pos = oval(slot.angle, SEAT.rx, SEAT.rz);
    const chair = makeChair(mats, new THREE.Color(meta.color));
    chair.group.position.set(pos.x, 0, pos.z);
    chair.group.rotation.y = yawToward(pos.x, pos.z);
    const fly = createFly(meta);
    fly.group.position.y = 0.5;
    chair.group.add(fly.group);
    const label = makeSprite(meta.name, `#${meta.color.toString(16).padStart(6, '0')}`);
    label.position.set(0, 1.05, -0.05);
    fly.group.add(label);
    const holes = [createCardMesh(), createCardMesh()];
    holes.forEach((mesh) => scene.add(mesh));
    const ringMat = new THREE.MeshStandardMaterial({
      color: meta.color,
      emissive: meta.color,
      emissiveIntensity: 0.08,
      roughness: 0.4,
    });
    const ring = shade(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 20), ringMat), false);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pos.x, 0.03, pos.z);
    const stackGroup = new THREE.Group();
    const betGroup = new THREE.Group();
    scene.add(chair.group, ring, stackGroup, betGroup);
    return {
      id: slot.id,
      angle: slot.angle,
      anchor: pos,
      fly,
      cushion: chair.cushion,
      holes,
      ring,
      label,
      labelKey: meta.name,
      stackGroup,
      betGroup,
    };
  });
}

function token(mats, letter, fill, ink) {
  const g = new THREE.Group();
  const disc = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16), new THREE.MeshStandardMaterial({
    color: fill,
    roughness: 0.45,
  })));
  g.add(disc);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `#${ink.toString(16).padStart(6, '0')}`;
  ctx.font = '700 78px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  label.rotation.x = -Math.PI / 2;
  label.position.y = 0.012;
  g.add(label);
  g.visible = false;
  void mats;
  return g;
}

function placeToken(mesh, state, flag, scale) {
  const seat = (state.seats || []).find((s) => s[flag]);
  if (!seat) {
    mesh.visible = false;
    return;
  }
  const slot = SEATS.find((s) => s.id === seat.id);
  if (!slot) {
    mesh.visible = false;
    return;
  }
  const p = feltPoint(slot.angle, scale);
  const tangent = flag === 'isButton' ? 0.16 : flag === 'isSmallBlind' ? -0.12 : 0.12;
  mesh.position.set(p.x + tangent, TABLE.top + 0.04, p.z);
  mesh.visible = true;
}

function warnIfInsideFelt(seats, beetle) {
  for (const seat of seats) {
    const yaw = yawToward(seat.anchor.x, seat.anchor.z);
    const inward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const head = new THREE.Vector3(seat.anchor.x, 0, seat.anchor.z).addScaledVector(inward, 0.36);
    if (insideFelt(head.x, head.z)) {
      console.warn(`${seat.id} head is inside the felt`, head);
    }
  }
  if (insideFelt(beetle.pos.x, beetle.pos.z)) console.warn('dealer is inside the felt', beetle.pos);
}
