/** Table controls and the contender strip. Inspection lives in the brain panel. */

const STYLE = {
  'tight-aggressive': 'Tight-aggressive',
  'loose-aggressive': 'Loose-aggressive',
  'tight-passive': 'Tight-passive',
  'loose-passive': 'Loose-passive',
  maniac: 'Maniac',
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function formatAction(ev, name) {
  const who = name || ev.flyId || 'Someone';
  const amount = ev.amount ? ` ${ev.amount}` : '';
  if (ev.action === 'raise') return `${who} raises to ${ev.raiseTo ?? ev.amount ?? ''}`.trim();
  if (ev.action === 'bet') return `${who} bets${amount}`;
  if (ev.action === 'call') return `${who} calls${amount}`;
  if (ev.action === 'fold') return `${who} folds`;
  if (ev.action === 'check') return `${who} checks`;
  if (ev.handEnded) return `${who} ends the hand`;
  return `${who} ${ev.action || ''}`.trim();
}

export function mountHud() {
  const root = document.createElement('div');
  root.id = 'hud';
  root.hidden = true;
  root.innerHTML = `
    <header class="top">
      <div class="brand">
        <p class="eyebrow">On the rail</p>
        <h1>Fly poker</h1>
      </div>
      <div class="status">
        <p class="street" data-street>Waiting</p>
        <p class="sub" data-sub>Click a fly to open its brain</p>
      </div>
      <div class="potline">
        <p class="pot" data-pot>Pot 0</p>
        <p class="sub" data-note></p>
      </div>
    </header>
    <aside class="log" data-log></aside>
    <footer class="dock">
      <div class="controls">
        <button type="button" data-deal>Deal</button>
        <button type="button" data-next>Next</button>
        <button type="button" data-auto>Auto-play</button>
        <label class="speed">Speed <input type="range" min="1" max="8" value="4" data-speed /> <span data-speed-label>0.6s</span></label>
        <button type="button" data-reset class="ghost">Reset</button>
      </div>
      <div class="stats" data-stats></div>
    </footer>
    <p class="error" data-error hidden></p>
    <p class="hint">Drag to look · scroll to zoom · Esc closes the brain</p>
  `;
  document.body.appendChild(root);

  const street = root.querySelector('[data-street]');
  const sub = root.querySelector('[data-sub]');
  const pot = root.querySelector('[data-pot]');
  const note = root.querySelector('[data-note]');
  const log = root.querySelector('[data-log]');
  const stats = root.querySelector('[data-stats]');
  const error = root.querySelector('[data-error]');
  const deal = root.querySelector('[data-deal]');
  const next = root.querySelector('[data-next]');
  const auto = root.querySelector('[data-auto]');
  const reset = root.querySelector('[data-reset]');
  const speed = root.querySelector('[data-speed]');
  const speedLabel = root.querySelector('[data-speed-label]');

  const handlers = { deal: [], next: [], auto: [], reset: [], select: [] };
  deal.addEventListener('click', () => handlers.deal.forEach((fn) => fn()));
  next.addEventListener('click', () => handlers.next.forEach((fn) => fn()));
  auto.addEventListener('click', () => handlers.auto.forEach((fn) => fn()));
  reset.addEventListener('click', () => handlers.reset.forEach((fn) => fn()));
  stats.addEventListener('click', (event) => {
    const button = event.target.closest('[data-fly]');
    if (button) handlers.select.forEach((fn) => fn(button.dataset.fly));
  });

  function delayMs() {
    return 1100 - Number(speed.value) * 120;
  }
  function paintSpeed() {
    speedLabel.textContent = `${(delayMs() / 1000).toFixed(1)}s`;
  }
  speed.addEventListener('input', paintSpeed);
  paintSpeed();

  function render(state, { busy = false, selectedId = null } = {}) {
    const live = Boolean(state?.handLive);
    street.textContent = live ? (state.street || 'Hand') : 'Between hands';
    const actor = state?.seats?.find((seat) => seat.isActor);
    sub.textContent = actor ? `${actor.name} to act` : (state?.message || 'Deal when you are ready');
    pot.textContent = `Pot ${state?.pot ?? 0}`;
    note.textContent = state?.handNumber ? `Hand ${state.handNumber}` : 'No hand yet';
    deal.disabled = busy || !state?.canDeal;
    next.disabled = busy || !live;
    paintLog(state);
    paintStats(state, selectedId);
  }

  function paintStats(state, selectedId) {
    const seats = state?.seats || [];
    stats.innerHTML = seats.map((seat) => {
      const accent = seat.colorHex || `#${Number(seat.color || 0).toString(16).padStart(6, '0')}`;
      const classes = [
        'plate',
        seat.isActor ? 'acting' : '',
        seat.id === selectedId ? 'picked' : '',
        seat.folded || seat.stack === 0 ? 'folded' : '',
      ].filter(Boolean).join(' ');
      const style = STYLE[seat.style] || seat.style || '';
      return `<button type="button" class="${classes}" data-fly="${esc(seat.id)}" style="--fly:${esc(accent)}">
        <span class="who">${esc(seat.name)}</span>
        <span class="chips">${esc(seat.stack)}</span>
        <span class="meta">${esc(style)}</span>
      </button>`;
    }).join('');
  }

  function paintLog(state) {
    const names = Object.fromEntries((state?.seats || []).map((seat) => [seat.id, seat.name]));
    const events = state?.lastActions || [];
    if (!events.length) {
      log.innerHTML = '<p class="log-title">Action log</p><p class="empty">No actions yet. Deal a hand.</p>';
      return;
    }
    const rows = ['<p class="log-title">Action log</p>'];
    let hand = null;
    for (const ev of events.slice(-14)) {
      if (ev.handNumber !== hand) {
        hand = ev.handNumber;
        rows.push(`<p class="hand-break">Hand ${esc(hand)}</p>`);
      }
      rows.push(`<p><span class="st">${esc(ev.street || '')}</span> ${esc(formatAction(ev, names[ev.flyId]))}</p>`);
    }
    log.innerHTML = rows.join('');
    log.scrollTop = log.scrollHeight;
  }

  return {
    root,
    delayMs,
    render,
    setAuto(on) {
      auto.classList.toggle('on', on);
      auto.textContent = on ? 'Stop' : 'Auto-play';
    },
    setError(message) {
      error.hidden = !message;
      error.textContent = message || '';
    },
    show() {
      root.hidden = false;
    },
    onDeal(fn) { handlers.deal.push(fn); },
    onNext(fn) { handlers.next.push(fn); },
    onAuto(fn) { handlers.auto.push(fn); },
    onReset(fn) { handlers.reset.push(fn); },
    onSelect(fn) { handlers.select.push(fn); },
  };
}
