// Betting slip for Full House-flies.
// Plain DOM, no dependencies, so it sits on top of the Three.js canvas without touching it.
//
//   import { initBetting } from './ui/betting.js';
//   const betting = initBetting({ playerNames: ['Fly 1', ... 'Fly 6'] });
//   betting.selectSeat(3);   // call this when the user clicks fly #3 in the 3D scene
//
// Seats are 1-6 and must match the seat numbers the poker engine sends to /settle.

const DEFAULTS = {
  apiBase: 'http://127.0.0.1:8000',
  playerNames: ['Fly 1', 'Fly 2', 'Fly 3', 'Fly 4', 'Fly 5', 'Fly 6'],
  pollMs: 1500,
  devFundCents: 100_00,                 // test money handed to a new guest ($100)
  dev: new URLSearchParams(location.search).has('dev'),
};

const STAKES = [100, 500, 2500, 10000]; // cents: $1 $5 $25 $100

const money = (c) => '$' + (c / 100).toFixed(2).replace(/\.00$/, '');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function initBetting(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const state = {
    userId: null,
    balance: 0,
    round: null,          // latest round_view from the server
    myBets: [],           // my bets in the current round
    seat: null,           // selected seat (1-6)
    stake: STAKES[1],
    message: '',
    messageKind: '',
    result: null,         // {kind, text} shown after a round ends
    online: true,
  };
  const listeners = [];
  let engineKey = '';

  // ---------------------------------------------------------------- API
  async function api(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(cfg.apiBase + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(state.userId ? { 'X-User-Id': String(state.userId) } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const d = data && data.detail;
      throw new Error(typeof d === 'string' ? d : 'Request failed (' + res.status + ')');
    }
    return data;
  }

  async function ensureUser() {
    const saved = Number(localStorage.getItem('flypoker.userId'));
    if (saved) {
      try {
        const u = await api('/users/' + saved);
        state.userId = u.id;
        state.balance = u.balance;
        return;
      } catch { /* backend reset or user missing: make a new one below */ }
    }
    const name = 'guest-' + Math.random().toString(36).slice(2, 8);
    const u = await api('/users', { method: 'POST', body: { username: name } });
    localStorage.setItem('flypoker.userId', String(u.id));
    state.userId = u.id;
    if (cfg.dev) await addFunds(cfg.devFundCents);
  }

  async function addFunds(cents) {
    const r = await api('/users/' + state.userId + '/deposit', { method: 'POST', body: { amount: cents } });
    state.balance = r.balance;
  }

  async function loadMyBets() {
    if (!state.round) { state.myBets = []; return; }
    const all = await api('/users/' + state.userId + '/bets');
    state.myBets = all.filter((b) => b.round_id === state.round.id);
  }

  async function poll() {
    try {
      const prev = state.round;
      const [round, user] = await Promise.all([
        api('/rounds/latest'),
        api('/users/' + state.userId),
      ]);
      state.online = true;
      state.balance = user.balance;
      state.round = round;

      const roundChanged = (prev && prev.id) !== (round && round.id);
      const statusChanged = prev && round && prev.id === round.id && prev.status !== round.status;
      if (roundChanged) { state.result = null; state.seat = null; }
      if (roundChanged || statusChanged) {
        await loadMyBets();
        if (statusChanged && (round.status === 'settled' || round.status === 'cancelled')) showResult();
      }
      listeners.forEach((fn) => fn(round));
    } catch (err) {
      state.online = false;
    }
    render();
  }

  function showResult() {
    const r = state.round;
    if (!state.myBets.length) return;
    const staked = state.myBets.reduce((s, b) => s + b.amount, 0);
    const paid = state.myBets.reduce((s, b) => s + (b.payout || 0), 0);
    if (r.status === 'cancelled' || state.myBets.every((b) => b.status === 'refunded')) {
      state.result = { kind: 'refund', text: 'Round called off. ' + money(staked) + ' returned.' };
    } else if (paid > 0) {
      state.result = { kind: 'win', text: 'You won ' + money(paid) + ' (profit ' + money(paid - staked) + ').' };
    } else {
      state.result = { kind: 'loss', text: 'No luck. You lost ' + money(staked) + '.' };
    }
  }

  // ---------------------------------------------------------------- actions
  function say(text, kind = '') { state.message = text; state.messageKind = kind; render(); }

  async function placeBet() {
    if (!state.seat) return say('Pick a fly first.', 'err');
    try {
      const r = await api('/bets', {
        method: 'POST',
        body: { round_id: state.round.id, seat: state.seat, amount: state.stake },
      });
      state.balance = r.balance;
      state.round = r.round;
      await loadMyBets();
      say('Bet placed: ' + money(state.stake) + ' on ' + nameOf(state.seat) + '.', 'ok');
    } catch (e) {
      say(e.message, 'err');
    }
  }

  async function engine(path, body) {
    try {
      await api(path, { method: 'POST', body, headers: { 'X-API-Key': engineKey } });
      say('Done.', 'ok');
      await poll();
    } catch (e) { say(e.message, 'err'); }
  }

  const nameOf = (seat) => (state.round && state.round.players[seat - 1].name) || cfg.playerNames[seat - 1];

  // ---------------------------------------------------------------- DOM
  const root = el('aside', 'fp-slip');
  root.setAttribute('aria-label', 'Betting slip');

  const tab = el('button', 'fp-slip-tab');
  tab.type = 'button';
  tab.setAttribute('aria-controls', 'fp-slip-panel');
  const arrow = el('span', 'fp-slip-arrow');
  arrow.setAttribute('aria-hidden', 'true');
  tab.append(arrow);

  const panel = el('div', 'fp-slip-panel');
  panel.id = 'fp-slip-panel';

  const head = el('header', 'fp-head');
  const title = el('h2', 'fp-title', 'Betting slip');
  const status = el('span', 'fp-status');
  head.append(title, status);

  const wallet = el('div', 'fp-wallet');
  const balEl = el('strong', 'fp-balance');
  const timerEl = el('span', 'fp-timer');
  wallet.append(el('span', '', 'Balance '), balEl, timerEl);

  const seatList = el('div', 'fp-seats');
  seatList.setAttribute('role', 'radiogroup');
  seatList.setAttribute('aria-label', 'Choose a fly');
  const seatEls = [];
  for (let s = 1; s <= 6; s++) {
    const b = el('button', 'fp-seat');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    const name = el('span', 'fp-seat-name');
    const mine = el('span', 'fp-seat-mine');
    const pool = el('span', 'fp-seat-pool');
    const odds = el('span', 'fp-seat-odds');
    b.append(name, mine, pool, odds);
    b.addEventListener('click', () => api_selectSeat(s));
    seatList.append(b);
    seatEls.push({ b, name, mine, pool, odds });
  }

  const stakeRow = el('div', 'fp-stakes');
  const stakeBtns = STAKES.map((c) => {
    const b = el('button', 'fp-chip', money(c));
    b.type = 'button';
    b.addEventListener('click', () => { state.stake = c; input.value = c / 100; render(); });
    stakeRow.append(b);
    return { c, b };
  });
  const input = el('input', 'fp-amount');
  input.type = 'number'; input.min = '1'; input.step = '1'; input.value = state.stake / 100;
  input.setAttribute('aria-label', 'Bet amount in dollars');
  input.addEventListener('input', () => {
    state.stake = Math.round((Number(input.value) || 0) * 100);
    render();
  });
  stakeRow.append(input);

  const betBtn = el('button', 'fp-bet');
  betBtn.type = 'button';
  betBtn.addEventListener('click', placeBet);

  const msgEl = el('p', 'fp-msg');
  msgEl.setAttribute('aria-live', 'polite');
  const resultEl = el('p', 'fp-result');
  const mineEl = el('p', 'fp-mybets');

  panel.append(head, wallet, seatList, stakeRow, betBtn, msgEl, resultEl, mineEl);

  // Dev drawer: lets you drive a round from the browser, no Python engine needed.
  // The engine key in a browser is only acceptable for local testing.
  if (cfg.dev) {
    const dev = el('details', 'fp-dev');
    dev.append(el('summary', '', 'Test controls'));
    const key = el('input', 'fp-dev-key');
    key.placeholder = 'Engine API key'; key.value = 'dev-engine-key';
    engineKey = key.value;
    key.addEventListener('input', () => { engineKey = key.value; });
    const winner = el('select', 'fp-dev-winner');
    for (let s = 1; s <= 6; s++) winner.append(new Option('Winner: seat ' + s, s));
    const mk = (label, fn) => {
      const b = el('button', 'fp-dev-btn', label); b.type = 'button'; b.addEventListener('click', fn); return b;
    };
    dev.append(
      key,
      mk('New round', () => engine('/rounds', { players: cfg.playerNames })),
      mk('Lock', () => engine('/rounds/' + state.round.id + '/lock')),
      winner,
      mk('Settle', () => engine('/rounds/' + state.round.id + '/settle', { winner_seats: [Number(winner.value)] })),
      mk('Cancel', () => engine('/rounds/' + state.round.id + '/cancel')),
      mk('Add $100', async () => { try { await addFunds(10000); render(); } catch (e) { say(e.message, 'err'); } }),
    );
    panel.append(dev);
  }

  let slipOpen = false;
  function setSlipOpen(open) {
    slipOpen = open;
    root.classList.toggle('is-open', open);
    tab.setAttribute('aria-expanded', open ? 'true' : 'false');
    tab.setAttribute('aria-label', open ? 'Hide betting slip' : 'Show betting slip');
    panel.toggleAttribute('inert', !open);
  }
  tab.addEventListener('click', () => setSlipOpen(!slipOpen));
  setSlipOpen(false);

  root.append(tab, panel);
  document.body.append(root);

  // ---------------------------------------------------------------- render
  const STATUS_TEXT = { open: 'Betting open', locked: 'Betting closed', settled: 'Finished', cancelled: 'Called off' };

  function render() {
    const r = state.round;
    const canBet = !!r && r.status === 'open' && state.online &&
      !(r.closes_at && Date.now() / 1000 >= r.closes_at);

    status.textContent = !state.online ? 'Offline' : r ? STATUS_TEXT[r.status] : 'Waiting for a round';
    status.dataset.state = !state.online ? 'offline' : r ? r.status : 'idle';
    balEl.textContent = money(state.balance);

    if (r && r.status === 'open' && r.closes_at) {
      const left = Math.max(0, Math.ceil(r.closes_at - Date.now() / 1000));
      timerEl.textContent = left + 's left';
    } else timerEl.textContent = '';

    const mineBySeat = {};
    state.myBets.forEach((b) => { mineBySeat[b.seat] = (mineBySeat[b.seat] || 0) + b.amount; });

    seatEls.forEach((s, i) => {
      const seat = i + 1;
      const p = r && r.players[i];
      s.name.textContent = p ? p.name : cfg.playerNames[i];
      s.pool.textContent = p ? money(p.pool) : '';
      s.odds.textContent = p && p.odds ? p.odds.toFixed(2) + 'x' : '–';
      s.mine.textContent = mineBySeat[seat] ? 'You: ' + money(mineBySeat[seat]) : '';
      s.b.setAttribute('aria-checked', String(state.seat === seat));
      s.b.classList.toggle('is-selected', state.seat === seat);
      s.b.classList.toggle('is-winner', !!(r && r.winner_seats && r.winner_seats.includes(seat)));
      s.b.disabled = !canBet;
    });

    stakeBtns.forEach(({ c, b }) => b.classList.toggle('is-on', state.stake === c));

    const valid = state.stake >= 100 && state.stake <= 1_000_000 && state.stake <= state.balance;
    betBtn.disabled = !(canBet && state.seat && valid);
    betBtn.textContent = !r ? 'No round yet'
      : !canBet ? 'Betting closed'
      : !state.seat ? 'Pick a fly'
      : state.stake > state.balance ? 'Not enough balance'
      : 'Bet ' + money(state.stake) + ' on ' + nameOf(state.seat);

    msgEl.textContent = state.message;
    msgEl.dataset.kind = state.messageKind;
    resultEl.textContent = state.result ? state.result.text : '';
    resultEl.dataset.kind = state.result ? state.result.kind : '';
    const total = state.myBets.reduce((s, b) => s + b.amount, 0);
    mineEl.textContent = total ? 'Your total this round: ' + money(total) : '';
  }

  // ---------------------------------------------------------------- public API
  function api_selectSeat(seat) {
    if (seat < 1 || seat > 6) return;
    state.seat = seat;
    state.message = '';
    render();
  }

  const handle = {
    selectSeat: api_selectSeat,                 // call from the 3D scene when a fly is clicked
    refresh: poll,
    onRoundUpdate: (fn) => listeners.push(fn),  // e.g. highlight the winning fly in 3D
    get round() { return state.round; },
    get selectedSeat() { return state.seat; },
  };

  ensureUser()
    .catch(() => { state.online = false; })
    .finally(() => { render(); poll(); setInterval(poll, cfg.pollMs); setInterval(render, 1000); });

  render();
  return handle;
}
