/** Top-down betting camera. Hole cards face the lens; rail view puts them back toward each fly. */

import * as THREE from 'three';
import { TABLE } from './room.js';

export function mountBetView(view, { getDealModule, getDealLayer } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'bet-view';
  button.textContent = 'Betting view';
  button.setAttribute('aria-pressed', 'false');
  const dock = document.querySelector('#hud .controls');
  if (dock) dock.appendChild(button);
  else document.body.appendChild(button);

  const camera = view.camera;
  const controls = view.controls;
  const orbitUpdate = controls.update.bind(controls);
  const lampGroup = view.lamp && view.lamp.bulb ? view.lamp.bulb.parent : null;
  const beams = [];
  view.scene.traverse((obj) => {
    if (obj.name === 'ceiling-beam') beams.push(obj);
  });

  function setBeams(visible) {
    for (const beam of beams) beam.visible = visible;
  }
  let mode = 'rail';
  let saved = null;

  function paintCards(next) {
    const mod = typeof getDealModule === 'function' ? getDealModule() : null;
    const layer = typeof getDealLayer === 'function' ? getDealLayer() : null;
    if (!mod || typeof mod.setCardView !== 'function' || !layer) return;
    try {
      mod.setCardView(layer, next);
    } catch (error) {
      console.warn('setCardView failed', error);
    }
  }

  function applyTop() {
    const aspect = camera.aspect > 0.05 ? camera.aspect : 1;
    const halfX = Math.max(TABLE.apronRx, TABLE.feltRx) + 1.15;
    const halfZ = Math.max(TABLE.apronRz, TABLE.feltRz) + 0.85;
    const fov = 62;
    const tan = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const dist = Math.max(halfZ / tan, halfX / (tan * aspect)) + 0.35;
    camera.fov = fov;
    camera.up.set(0, 0, -1);
    camera.position.set(TABLE.x, TABLE.top + dist, TABLE.z);
    camera.lookAt(TABLE.x, TABLE.top, TABLE.z);
    camera.updateProjectionMatrix();
    if (lampGroup) lampGroup.visible = false;
    setBeams(false);
    paintCards('top');
  }

  function showTop() {
    if (mode === 'top') return;
    saved = {
      position: camera.position.clone(),
      target: controls.target.clone(),
      fov: camera.fov,
    };
    mode = 'top';
    controls.enabled = false;
    button.textContent = 'Rail view';
    button.setAttribute('aria-pressed', 'true');
    button.classList.add('on');
    applyTop();
  }

  function showRail() {
    if (mode !== 'top' || !saved) return;
    mode = 'rail';
    paintCards('rail');
    camera.up.set(0, 1, 0);
    camera.position.copy(saved.position);
    camera.fov = saved.fov;
    camera.updateProjectionMatrix();
    controls.target.copy(saved.target);
    controls.enabled = true;
    if (lampGroup) lampGroup.visible = true;
    setBeams(true);
    button.textContent = 'Betting view';
    button.setAttribute('aria-pressed', 'false');
    button.classList.remove('on');
    orbitUpdate();
  }

  controls.update = function update() {
    if (mode === 'top') {
      applyTop();
      return;
    }
    return orbitUpdate();
  };

  button.addEventListener('click', () => {
    if (mode === 'top') showRail();
    else showTop();
  });

  return { showTop, showRail };
}
