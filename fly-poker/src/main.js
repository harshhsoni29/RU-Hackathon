import * as THREE from 'three';
import {
  FLIES,
  createTable,
  dealHand,
  getFlyInspection,
  getPublicState,
  step,
} from './contract.js';
import { placeCast, setFlyEmote } from './ui/flies.js';
import { mountHud } from './ui/hud.js';
import { TABLE, createRailView } from './ui/room.js';
import { mountTitle } from './ui/title.js';
import { mountBetView } from './ui/betview.js';
import { initBetting } from './ui/betting.js';

const boot = document.getElementById('boot');
const canvas = document.getElementById('view');

function fail(error) {
  console.error(error);
  boot.hidden = false;
  boot.textContent = error?.message || String(error);
}

async function loadOptional(path) {
  try {
    return await import(path);
  } catch (error) {
    console.warn(`Optional module ${path} is not available.`, error);
    return null;
  }
}

function isPromise(value) {
  return Boolean(value && typeof value.then === 'function');
}

function liveSeed() {
  const words = new Uint32Array(1);
  crypto.getRandomValues(words);
  return words[0];
}

try {
  const [dealMod, chipMod, brainMod] = await Promise.all([
    loadOptional('./ui/deal.js'),
    loadOptional('./ui/chips.js'),
    loadOptional('./ui/brain.js'),
  ]);

  const view = createRailView(canvas);
  const cast = placeCast(view.scene, FLIES);
  const brainRoot = document.createElement('div');
  brainRoot.id = 'brain';
  document.body.appendChild(brainRoot);

  let dealLayer = null;
  let chipLayer = null;
  let brain = null;
  const layerDeps = {
    THREE,
    camera: view.camera,
    scene: view.scene,
    table: TABLE,
    seats: cast.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      color: seat.color,
      angle: seat.angle,
      position: seat.position,
      // Hole-card faces point along outward, toward that fly. Backs point inward.
      outward: seat.outward,
      cardAnchor: seat.cardAnchor,
    })),
    dealer: {
      position: {
        x: cast.dealer.pivot.position.x,
        y: cast.dealer.pivot.position.y,
        z: cast.dealer.pivot.position.z,
      },
    },
    deck: view.anchors.deck,
    boardAnchor: view.anchors.board,
    potAnchor: view.anchors.pot,
  };
  if (dealMod?.createDealLayer) {
    try {
      dealLayer = dealMod.createDealLayer(view.scene, layerDeps);
    } catch (error) {
      console.warn('createDealLayer failed', error);
    }
  }
  if (chipMod?.createChipLayer) {
    try {
      chipLayer = chipMod.createChipLayer(view.scene, layerDeps);
    } catch (error) {
      console.warn('createChipLayer failed', error);
    }
  }
  if (brainMod?.createBrainPanel) {
    try {
      brain = brainMod.createBrainPanel(brainRoot);
    } catch (error) {
      console.warn('createBrainPanel failed', error);
    }
  }

  const hud = mountHud();
  mountBetView(view, {
    getDealModule: () => dealMod,
    getDealLayer: () => dealLayer,
  });

  // Backend seat N is the Nth fly. betting.js needs the HUD's dock and header mounted first.
  const betting = initBetting({ playerNames: FLIES.map((fly) => fly.name) });
  const seatOf = (flyId) => FLIES.findIndex((fly) => fly.id === flyId) + 1;
  /** Auto-play: how long a finished hand stays on screen before the "!" bet prompt. */
  const HOLD_MS = 2500;
  let wasLive = false;
  let betDeadline = 0;

  const title = mountTitle(() => {
    entered = true;
    view.controls.autoRotate = false;
    view.controls.reset();
    hud.show();
    betting.openWindow({ stillWanted: () => !wasLive });
  });
  view.controls.autoRotate = true;
  view.controls.autoRotateSpeed = 0.6;

  let table = createTable({ seed: liveSeed() });
  let entered = false;
  let auto = false;
  let busy = false;
  let timer = 0;
  let selectedId = null;
  const winners = new Set();

  /** A hand just ended: settle bets on the winning seats, then reopen betting when playing by hand. */
  function settleBets(state) {
    if (wasLive && !state.handLive) {
      const seats = (state.lastSettlement?.winners || []).map((w) => seatOf(w.id)).filter(Boolean);
      betting.settle([...new Set(seats)]).then(() => {
        if (!wasLive && !auto) betting.openWindow({ stillWanted: () => !wasLive && !auto });
      });
    }
    wasLive = state.handLive;
  }

  function refresh() {
    const state = getPublicState(table);
    cast.updateTags(state, winners);
    hud.render(state, { busy, selectedId });
    settleBets(state);
    if (selectedId && brain && !brain.hidden && brain.classList.contains('is-open') && brainMod?.showBrain) {
      try {
        brainMod.showBrain(brain, getFlyInspection(table, selectedId));
      } catch (error) {
        console.warn('showBrain failed', error);
      }
    }
    if (!busy && chipMod?.syncStacks && chipLayer) {
      try {
        chipMod.syncStacks(state);
      } catch (error) {
        console.warn('syncStacks failed', error);
      }
    }
    return state;
  }

  async function runDealAnimation(state) {
    if (!dealMod?.playDealAnimation || !dealLayer) return;
    try {
      const pending = dealMod.playDealAnimation(dealLayer, state);
      if (isPromise(pending)) await pending;
    } catch (error) {
      console.warn('playDealAnimation failed', error);
    }
  }

  async function runChipAnimation(action, state) {
    if (!chipMod?.playChipAnimation || !chipLayer) return;
    try {
      const pending = chipMod.playChipAnimation(chipLayer, action, state);
      if (isPromise(pending)) await pending;
    } catch (error) {
      console.warn('playChipAnimation failed', error);
    }
  }

  function stopAuto() {
    auto = false;
    clearTimeout(timer);
    betting.cancelOffer();
    hud.setAuto(false);
  }

  function rememberWinners(action) {
    if (!action?.handEnded) return;
    winners.clear();
    for (const winner of action.winners || []) winners.add(winner.id);
  }

  async function playDeal() {
    await betting.lock();
    winners.clear();
    dealHand(table);
    const state = refresh();
    await runDealAnimation(state);
  }

  async function playStep() {
    const action = step(table);
    rememberWinners(action);
    const state = refresh();
    const kind = action?.action;
    if (action?.flyId && (kind === 'fold' || kind === 'check' || kind === 'call' || kind === 'bet' || kind === 'raise')) {
      setFlyEmote(action.flyId, kind);
    }
    for (const winner of action?.winners || []) {
      if (winner?.id) setFlyEmote(winner.id, 'win');
    }
    for (const seat of state.seats) {
      if (seat.stack === 0) setFlyEmote(seat.id, 'bust');
    }
    await Promise.all([
      runChipAnimation(action, state),
      runDealAnimation(state),
    ]);
    return action;
  }

  /**
   * Between hands in auto-play: finish any open window, otherwise hold on the winner, then offer the "!".
   * Returns false when auto-play stopped or the loop should poll again later.
   */
  async function betBeforeDeal() {
    if (betting.windowOpen) {
      await betting.waitWindow();
      return auto;
    }
    if (betting.readyToDeal) return true;
    if (!betDeadline) betDeadline = Date.now() + (betting.online ? HOLD_MS : 0);
    if (Date.now() < betDeadline) {
      timer = setTimeout(tick, 250);
      return false;
    }
    betDeadline = 0;
    const wantsToBet = betting.online && await betting.offer();
    if (!auto) return false;
    if (wantsToBet) {
      await betting.openWindow({ stillWanted: () => auto });
    } else {
      await betting.ensureOpen();
      await betting.rebet();
    }
    return auto;
  }

  async function tick() {
    if (!auto || !entered) return;
    if (busy) {
      timer = setTimeout(tick, 40);
      return;
    }
    const state = getPublicState(table);
    if (!state.handLive && state.canDeal && !(await betBeforeDeal())) return;
    busy = true;
    hud.render(getPublicState(table), { busy, selectedId });
    try {
      const now = getPublicState(table);
      if (now.handLive) await playStep();
      else if (now.canDeal) await playDeal();
      else {
        stopAuto();
        refresh();
        return;
      }
    } catch (error) {
      stopAuto();
      hud.setError(error.message);
      refresh();
      return;
    } finally {
      busy = false;
    }
    refresh();
    if (auto) timer = setTimeout(tick, hud.delayMs());
  }

  function openBrain(id) {
    if (!entered || !id) return;
    selectedId = id;
    refresh();
    if (!brain || !brainMod?.showBrain) return;
    try {
      brainMod.showBrain(brain, getFlyInspection(table, id));
    } catch (error) {
      hud.setError(error.message);
    }
  }

  hud.onDeal(async () => {
    if (!entered || busy) return;
    stopAuto();
    hud.setError('');
    if (!getPublicState(table).canDeal) return;
    busy = true;
    refresh();
    try {
      await playDeal();
    } catch (error) {
      hud.setError(error.message);
    } finally {
      busy = false;
      refresh();
    }
  });

  hud.onNext(async () => {
    if (!entered || busy) return;
    stopAuto();
    hud.setError('');
    if (!getPublicState(table).handLive) return;
    busy = true;
    refresh();
    try {
      await playStep();
    } catch (error) {
      hud.setError(error.message);
    } finally {
      busy = false;
      refresh();
    }
  });

  hud.onAuto(() => {
    if (!entered) return;
    if (auto) {
      stopAuto();
      return;
    }
    hud.setError('');
    auto = true;
    hud.setAuto(true);
    tick();
  });

  hud.onReset(() => {
    if (!entered || busy) return;
    stopAuto();
    hud.setError('');
    table = createTable({ seed: liveSeed() });
    winners.clear();
    wasLive = false;
    betDeadline = 0;
    betting.forget();
    betting.cancel().then(() => betting.openWindow({ stillWanted: () => !wasLive }));
    selectedId = null;
    if (brain && brainMod?.hideBrain) brainMod.hideBrain(brain);
    refresh();
  });

  hud.onSelect(openBrain);

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !brain || !brainMod?.hideBrain) return;
    brainMod.hideBrain(brain);
    selectedId = null;
    refresh();
  });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointer = null;

  function pickFly(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, view.camera);
    const hits = raycaster.intersectObjects(cast.pickables(), true);
    for (const hit of hits) {
      let node = hit.object;
      while (node) {
        if (node.userData?.flyId) return node.userData.flyId;
        node = node.parent;
      }
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || title.isOpen()) return;
    pointer = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointer || event.button !== 0 || title.isOpen()) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer = null;
    if (dx * dx + dy * dy > 36) return;
    const id = pickFly(event.clientX, event.clientY);
    if (id) openBrain(id);
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('resize', () => {
    view.resize();
    cast.faceTable();
  });

  function frame(time) {
    requestAnimationFrame(frame);
    view.controls.update();
    cast.tick(time);
    view.renderer.render(view.scene, view.camera);
  }

  view.resize();
  refresh();
  requestAnimationFrame(frame);
  boot.remove();
} catch (error) {
  fail(error);
}
