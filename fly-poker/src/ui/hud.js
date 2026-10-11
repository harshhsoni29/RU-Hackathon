/** Table controls and the contender strip. Inspection lives in the brain panel. */

const STYLE = {
  'tight-aggressive': 'Tight-aggressive',
  'loose-aggressive': 'Loose-aggressive',
  'tight-passive': 'Tight-passive',
  'loose-passive': 'Loose-passive',
  maniac: 'Maniac',
  copycat: 'Copycat',
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

function actionText(ev) {
  const amount = ev.amount ? ` <b class="amt">${esc(ev.amount)}</b>` : '';
  if (ev.action === 'raise') return `raises to <b class="amt">${esc(ev.raiseTo ?? ev.amount ?? '')}</b>`;
  if (ev.action === 'bet') return `bets${amount}`;
  if (ev.action === 'call') return `calls${amount}`;
  if (ev.action === 'fold') return 'folds';
  if (ev.action === 'check') return 'checks';
  if (ev.handEnded) return 'ends the hand';
  return esc(ev.action || '');
}

const LOG_STORE = 'fly-log-open';

export function mountHud() {
  const root = document.createElement('div');
  root.id = 'hud';
  root.hidden = true;
  root.innerHTML = `
    <header class="top">
      <div class="brand">
        <p class="eyebrow">On the rail</p>
        <h1>Full House-flies</h1>
      </div>
      <div class="status">
        <p class="street" data-street>Waiting</p>
        <p class="sub" data-sub>Click a fly to open its brain</p>
        <p class="betline" data-betline></p>
        <div class="board-row" data-board aria-label="Community cards"></div>
      </div>
      <div class="potline">
        <p class="pot" data-pot>Pot 0</p>
        <p class="sub" data-note></p>
      </div>
    </header>
    <aside class="log-drawer" data-log-drawer aria-label="Action log">
      <button type="button" class="log-tab" data-log-tab aria-controls="action-log"></button>
      <div class="log" id="action-log" data-log></div>
    </aside>
    <footer class="dock">
      <div class="dock-top">
        <div class="controls">
          <button type="button" data-deal>Deal</button>
          <button type="button" data-next>Next</button>
          <button type="button" data-auto>Auto-play</button>
          <label class="speed">Speed <input type="range" min="1" max="19" value="15" data-speed /> <span data-speed-label>0.6s</span></label>
          <button type="button" data-reset class="ghost">Reset</button>
        </div>
        <div class="bet-bar" data-bet-bar></div>
      </div>
      <div class="stats" data-stats></div>
    </footer>
    <p class="error" data-error hidden></p>
  `;
  document.body.appendChild(root);

  const street = root.querySelector('[data-street]');
  const sub = root.querySelector('[data-sub]');
  const pot = root.querySelector('[data-pot]');
  const note = root.querySelector('[data-note]');
  const boardRow = root.querySelector('[data-board]');
  const log = root.querySelector('[data-log]');
  const stats = root.querySelector('[data-stats]');
  const error = root.querySelector('[data-error]');
  const deal = root.querySelector('[data-deal]');
  const next = root.querySelector('[data-next]');
  const auto = root.querySelector('[data-auto]');
  const reset = root.querySelector('[data-reset]');
  const speed = root.querySelector('[data-speed]');
  const speedLabel = root.querySelector('[data-speed-label]');

  const logDrawer = root.querySelector('[data-log-drawer]');
  const logTab = root.querySelector('[data-log-tab]');
  function setLogOpen(open) {
    logDrawer.classList.toggle('open', open);
    logTab.textContent = open ? '›' : '‹';
    logTab.setAttribute('aria-expanded', String(open));
    logTab.title = open ? 'Hide the action log' : 'Show the action log';
    log.inert = !open;
    localStorage.setItem(LOG_STORE, open ? '1' : '0');
  }
  logTab.addEventListener('click', () => setLogOpen(!logDrawer.classList.contains('open')));
  setLogOpen(localStorage.getItem(LOG_STORE) !== '0');

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
    return (21 - Number(speed.value)) * 100;   // 2.0 s at the slow end, 0.2 s at the fast end
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
    boardRow.innerHTML = (state?.board || []).map(cardChip).join('');
    paintLog(state);
    paintStats(state, selectedId);
  }

  /** One column per fly: a bet card ([data-bet-seat], filled by betting.js) above the name plate. Updated in place so bet buttons survive renders. */
  function paintStats(state, selectedId) {
    const seats = state?.seats || [];
    const key = seats.map((seat) => seat.id).join('|');
    if (stats.dataset.key !== key) {
      stats.dataset.key = key;
      stats.style.setProperty('--cols', String(Math.max(1, seats.length)));
      stats.innerHTML = seats.map((seat, i) => `
        <div class="seat">
          <div class="bet-slot" data-bet-seat="${i + 1}"></div>
          <button type="button" class="plate" data-fly="${esc(seat.id)}">
            <span class="who"></span>
            <span class="chips"></span>
            <span class="meta"></span>
            <span class="hand"></span>
          </button>
        </div>`).join('');
      document.dispatchEvent(new CustomEvent('seats-built'));
    }
    seats.forEach((seat, i) => {
      const col = stats.children[i];
      if (!col) return;
      const accent = seat.colorHex || `#${Number(seat.color || 0).toString(16).padStart(6, '0')}`;
      col.style.setProperty('--fly', accent);
      const plate = col.querySelector('.plate');
      plate.classList.toggle('acting', !!seat.isActor);
      plate.classList.toggle('picked', seat.id === selectedId);
      plate.classList.toggle('folded', !!seat.folded || seat.stack === 0);
      plate.querySelector('.who').textContent = seat.name;
      plate.querySelector('.chips').textContent = seat.stack;
      plate.querySelector('.meta').textContent = (STYLE[seat.style] || seat.style || '') + (seat.following ? ` · copying ${seat.following}` : '');
      const handHtml = (seat.holeCards || []).map(cardChip).join('');
      const handEl = plate.querySelector('.hand');
      if (handEl.dataset.html !== handHtml) {
        handEl.dataset.html = handHtml;
        handEl.innerHTML = handHtml;
      }
    });
  }

  const SUIT_GLYPH = { h: '♥', d: '♦', c: '♣', s: '♠' };
  function cardChip(card) {
    const rank = card?.rank ?? card?.code?.[0];
    const suit = String(card?.suit ?? card?.code?.[1] ?? '').toLowerCase();
    if (!rank || !SUIT_GLYPH[suit]) return '';
    const red = suit === 'h' || suit === 'd' ? ' red' : '';
    return `<span class="pcard${red}">${esc(rank === 'T' ? '10' : rank)}${SUIT_GLYPH[suit]}</span>`;
  }

  let shownKey = null;
  let shownEvents = new Set();
  function paintLog(state) {
    const seats = Object.fromEntries((state?.seats || []).map((seat) => [seat.id, seat]));
    const events = (state?.lastActions || []).slice(-14);
    const ids = events.map((ev, i) => `${ev.handNumber}:${ev.seq ?? i}:${ev.flyId}:${ev.action}`);
    const key = ids.join('|');
    if (key === shownKey) return;
    shownKey = key;
    const seen = shownEvents;
    shownEvents = new Set(ids);
    if (!events.length) {
      log.innerHTML = '<p class="log-title">Action log</p><p class="empty">No actions yet. Deal a hand.</p>';
      return;
    }
    const rows = ['<p class="log-title">Action log</p>'];
    let hand = null;
    events.forEach((ev, i) => {
      if (ev.handNumber !== hand) {
        hand = ev.handNumber;
        rows.push(`<p class="hand-break"><span>Hand ${esc(hand)}</span></p>`);
      }
      const seat = seats[ev.flyId];
      const accent = seat ? seat.colorHex || `#${Number(seat.color || 0).toString(16).padStart(6, '0')}` : 'var(--ink)';
      rows.push(`<p class="log-row${seen.has(ids[i]) ? '' : ' fresh'}" data-act="${ev.handEnded ? 'win' : esc(ev.action || '')}">`
        + `<b class="who" style="color:${esc(accent)}">${esc(seat?.name || ev.flyId || 'Someone')}</b> ${actionText(ev)}`
        + `<span class="st">${esc(ev.street || '')}</span></p>`);
    });
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
