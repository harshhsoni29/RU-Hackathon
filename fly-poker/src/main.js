import { loadEngine } from './ui/adapter.js';
import { createView } from './ui/scene.js';
import { markSelected, mountHud } from './ui/panels.js';
import { initBetting } from './ui/betting.js';

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
  const betting = initBetting({ playerNames: engine.FLIES.map((fly) => fly.name) });
  const seatOf = (flyId) => engine.FLIES.findIndex((fly) => fly.id === flyId) + 1;   // backend seat = index + 1
  const HOLD_MS = 2500;   // auto-play: how long the finished hand stays on screen before the "!" appears
  let wasLive = false;
  let betDeadline = 0;
  betting.openWindow({ stillWanted: () => !wasLive });   // first betting window opens as soon as the room loads
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
    if (wasLive && !state.handLive) {
      const seats = (state.lastSettlement?.winners || []).map((w) => seatOf(w.id)).filter(Boolean);
      // A fly won: settle the bets. Playing by hand, the betting UI slides back up for the next hand;
      // in auto-play the loop below offers it with the "!" instead.
      betting.settle([...new Set(seats)]).then(() => {
        if (!wasLive && !auto) betting.openWindow({ stillWanted: () => !wasLive && !auto });
      });
    }
    wasLive = state.handLive;
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
    betting.cancelOffer();
    hud.setAuto(false);
  }

  async function tick() {
    if (!auto) return;
    try {
      const state = engine.getPublicState(table);
      if (state.handLive) engine.step(table);
      else if (state.canDeal) {
        if (betting.windowOpen) {
          // A betting window is already running (the room's first one, say): let it finish, then deal.
          await betting.waitWindow();
          if (!auto) return;
        } else if (!betting.readyToDeal) {
          // Between hands: let the winner show, then pop up the "!" for 2 s.
          if (!betDeadline) betDeadline = Date.now() + (betting.online ? HOLD_MS : 0);
          if (Date.now() < betDeadline) { timer = setTimeout(tick, 250); return; }
          betDeadline = 0;
          const wantsToBet = betting.online && await betting.offer();
          if (!auto) return;
          if (wantsToBet) {
            await betting.openWindow({ stillWanted: () => auto });   // 10 s, skippable
            if (!auto) return;
          } else {
            await betting.ensureOpen();   // ignored: carry on, repeating the last bets
            await betting.rebet();
            if (!auto) return;
            await betting.lock();
            if (!auto) return;
          }
        }
        engine.dealHand(table);
      } else {
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

  hud.onDeal(async () => {
    stopAuto();
    hud.setError('');
    try {
      const state = engine.getPublicState(table);
      if (!state.canDeal) return;
      await betting.lock();   // no more bets once the cards are out
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
    wasLive = false;
    betDeadline = 0;
    betting.forget();
    betting.cancel().then(() => betting.openWindow({ stillWanted: () => !wasLive }));   // refund any open/locked round, then a fresh window
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
