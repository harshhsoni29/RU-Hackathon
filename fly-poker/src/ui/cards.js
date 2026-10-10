/** Chunky cards. Both broad faces show the rank so orbiting still reads them. */

import * as THREE from 'three';
import { cardBackTexture, cardTexture } from './textures.js';

const W = 0.26;
const H = 0.36;
const D = 0.018;

let backMap = null;
const faceCache = new Map();

function back() {
  if (!backMap) backMap = cardBackTexture();
  return backMap;
}

function face(rank, suit) {
  const key = `${rank}${suit}`;
  let tex = faceCache.get(key);
  if (!tex) {
    tex = cardTexture(rank, suit);
    faceCache.set(key, tex);
  }
  return tex;
}

export function createCardMesh() {
  const side = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.6 });
  const front = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, map: back() });
  const rear = front.clone();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [side, side, side, side, front, rear]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.visible = false;
  return mesh;
}

export function showCard(mesh, card, { folded = false } = {}) {
  if (!card) {
    mesh.visible = false;
    return;
  }
  const map = face(card.rank, card.suit);
  const front = mesh.material[4];
  const rear = mesh.material[5];
  front.map = map;
  rear.map = map;
  front.color.set(folded ? 0xb9b3a8 : 0xffffff);
  rear.color.set(folded ? 0xb9b3a8 : 0xffffff);
  front.needsUpdate = true;
  rear.needsUpdate = true;
  mesh.visible = true;
}

export const CARD = { W, H, D };
