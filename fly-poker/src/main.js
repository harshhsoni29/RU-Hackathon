import { loadEngine } from './ui/adapter.js';
import { createView } from './ui/scene.js';
import { markSelected, mountHud } from './ui/panels.js';

const boot = document.getElementById('boot');
const canvas = document.getElementById('view');

function fail(error) {
  console.error(error);
  boot.hidden = false;
  boot.textContent = error?.message || String(error);
}

try {
  const engine = await loadEngine();
  const hud = mountHud();
  const view = createView(canvas, engine.FLIES);
  let table = engine.createTable({ seed: 1 });
  let selectedId = null;
  let auto = false;
  let timer = 0;

  function refresh() {
    const state = engine.getPublicState(table);
    view.setState(state);
    view.setSelected(selectedId);
    markSelected(selectedId);
    hud.render(state);
    if (!selectedId) return;
    try {
      hud.renderInspect(engine.getFlyInspection(table, selectedId), true);
    } catch (error) {
      hud.renderInspect(null, true, error.message);
    }
  }

  function stopAuto() {
    auto = false;
    clearTimeout(timer);
    hud.setAuto(false);
  }

  function tick() {
    if (!auto) return;
    try {
      const state = engine.getPublicState(table);
      if (state.handLive) engine.step(table);
      else if (state.canDeal) engine.dealHand(table);
      else {
        stopAuto();
        refresh();
        return;
      }
      refresh();
    } catch (error) {
      stopAuto();
      hud.setError(error.message);
      return;
    }
    timer = setTimeout(tick, hud.delayMs());
  }

  function select(id) {
    selectedId = id;
    refresh();
  }

  hud.onDeal(() => {
    stopAuto();
    hud.setError('');
    try {
      const state = engine.getPublicState(table);
      if (!state.canDeal) return;
      engine.dealHand(table);
      refresh();
    } catch (error) {
      hud.setError(error.message);
    }
  });

  hud.onNext(() => {
    stopAuto();
    hud.setError('');
    try {
      if (!engine.getPublicState(table).handLive) return;
      engine.step(table);
      refresh();
    } catch (error) {
      hud.setError(error.message);
    }
  });

  hud.onAuto(() => {
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
    stopAuto();
    hud.setError('');
    table = engine.createTable({ seed: 1 });
    selectedId = null;
    hud.renderInspect(null, false);
    refresh();
  });

  hud.onSelect(select);
  hud.onCloseInspect(() => {
    selectedId = null;
    view.setSelected(null);
    markSelected(null);
    hud.render(engine.getPublicState(table));
  });

  let pointer = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pointer = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointer || event.button !== 0) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer = null;
    if (dx * dx + dy * dy > 36) return;
    const id = view.pick(event.clientX, event.clientY);
    if (id) select(id);
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('resize', () => view.resize());

  view.start();
  refresh();
  boot.remove();
  if (engine.source !== 'contract') {
    hud.setError('contract.js did not load. This is a preview room, not a live hand.');
  }
} catch (error) {
  fail(error);
}
