<<<<<<< HEAD
// Fly Poker betting, merged into the main HUD.
//
// There is no separate betting screen any more. panels.js builds one column per fly in the
// dock: a bet card on top ([data-bet-seat="N"]) and the fly's name plate underneath. This module
// fills those bet cards with live odds + a one-click "Bet" button, and adds a bankroll / chip
// picker to the dock ([data-bet-bar]) and the round status to the header ([data-betline]).
//
//   import { initBetting } from './ui/betting.js';
//   const betting = initBetting({ playerNames: FLIES.map((f) => f.name) });
//   betting.onRoundUpdate(fn);   // react to round changes (e.g. highlight winners)
//
// Seat N in the backend is the Nth fly (seat = index + 1).
//
// Betting happens in short windows. openWindow() slides the bet cards and chips up from the bottom
// of the dock and starts a skippable 10 s countdown; when it ends (or Skip is pressed) the round is
// locked and the betting UI slides away until the next hand is over. During auto-play, offer() pops
// up a "!" for 2 s instead; click it in time and a window opens, otherwise play carries on.

const DEFAULTS = {
  apiBase: 'http://127.0.0.1:8000',
  playerNames: [],
  pollMs: 1500,
  windowSeconds: 10,     // length of a betting window
  promptMs: 2000,        // how long the "!" stays up during auto-play
  dev: new URLSearchParams(location.search).has('dev'),
};

const CHIPS = [100, 500, 2500, 10000];   // cents: $1 $5 $25 $100
const MIN_BET = 100;
const MAX_BET = 1_000_000;
=======
// Betting slip for Fly Poker.
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
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12

const money = (c) => '$' + (c / 100).toFixed(2).replace(/\.00$/, '');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function initBetting(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
<<<<<<< HEAD
  const seatCount = cfg.playerNames.length;
  const state = {
    userId: null,
    balance: 0,
    round: null,
    myBets: [],
    lastBets: [],          // bets from the most recent finished round, repeated by auto-play
    stake: CHIPS[1],
    toast: '',
    toastKind: '',
    result: null,
    online: true,
  };
  const listeners = [];
  let engineKey = 'dev-engine-key';
  let toastTimer = 0;
  let resultTimer = 0;
=======
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
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12

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
<<<<<<< HEAD
      } catch { /* backend was reset or user missing: create a new one */ }
=======
      } catch { /* backend reset or user missing: make a new one below */ }
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
    }
    const name = 'guest-' + Math.random().toString(36).slice(2, 8);
    const u = await api('/users', { method: 'POST', body: { username: name } });
    localStorage.setItem('flypoker.userId', String(u.id));
    state.userId = u.id;
<<<<<<< HEAD
    state.balance = u.balance;           // the server grants the starting bankroll
=======
    if (cfg.dev) await addFunds(cfg.devFundCents);
  }

  async function addFunds(cents) {
    const r = await api('/users/' + state.userId + '/deposit', { method: 'POST', body: { amount: cents } });
    state.balance = r.balance;
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
  }

  async function loadMyBets() {
    if (!state.round) { state.myBets = []; return; }
    const all = await api('/users/' + state.userId + '/bets');
    state.myBets = all.filter((b) => b.round_id === state.round.id);
  }

  async function poll() {
    try {
<<<<<<< HEAD
      if (!state.userId) await ensureUser();
=======
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
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
<<<<<<< HEAD
      if (roundChanged) clearResult();
      if (roundChanged || statusChanged) {
        await loadMyBets();
        if (statusChanged && (round.status === 'settled' || round.status === 'cancelled')) {
          if (state.myBets.length) state.lastBets = state.myBets.map((b) => ({ seat: b.seat, amount: b.amount }));
          showResult();
        }
      }
      listeners.forEach((fn) => fn(round));
    } catch (e) {
      state.online = false;
      state.offlineWhy = e.message;
=======
      if (roundChanged) { state.result = null; state.seat = null; }
      if (roundChanged || statusChanged) {
        await loadMyBets();
        if (statusChanged && (round.status === 'settled' || round.status === 'cancelled')) showResult();
      }
      listeners.forEach((fn) => fn(round));
    } catch (err) {
      state.online = false;
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
    }
    render();
  }

<<<<<<< HEAD
  // ---------------------------------------------------------------- feedback
  function say(text, kind = '') {
    state.toast = text; state.toastKind = kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = ''; render(); }, 3500);
    render();
  }

  function clearResult() { clearTimeout(resultTimer); state.result = null; }

=======
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
  function showResult() {
    const r = state.round;
    if (!state.myBets.length) return;
    const staked = state.myBets.reduce((s, b) => s + b.amount, 0);
    const paid = state.myBets.reduce((s, b) => s + (b.payout || 0), 0);
<<<<<<< HEAD
    const winners = (r.winner_seats || []).map((s) => r.players[s - 1].name).join(' & ');
    if (r.status === 'cancelled' || state.myBets.every((b) => b.status === 'refunded')) {
      const called = r.status === 'cancelled';
      state.result = { kind: 'refund', title: called ? 'Hand called off' : 'No winning bets', big: money(staked),
        sub: called ? 'Your stake is back in your bankroll.' : (winners || 'The winner') + ' took the pot, but nobody backed them. Stakes refunded.' };
    } else {
      const net = paid - staked;
      const tail = winners + ' took the pot.' + (paid > 0 ? ' ' + money(paid) + ' paid out.' : '');
      if (net > 0) state.result = { kind: 'win', title: 'You won', big: '+' + money(net), sub: tail };
      else if (net === 0) state.result = { kind: 'refund', title: 'Broke even', big: money(0), sub: tail };
      else state.result = { kind: 'loss', title: paid > 0 ? 'Down on the hand' : 'Not this time', big: '-' + money(-net), sub: tail };
    }
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => { state.result = null; render(); }, 7000);
  }

  // ---------------------------------------------------------------- actions
  const nameOf = (seat) => (state.round && state.round.players[seat - 1] && state.round.players[seat - 1].name) || cfg.playerNames[seat - 1];
  const hasActiveBets = () => state.myBets.some((b) => b.status === 'active');

  function isOpen() {
    const r = state.round;
    return !!r && state.online && r.status === 'open' && !(r.closes_at && Date.now() / 1000 >= r.closes_at);
  }

  async function placeBet(seat) {
    if (!isOpen()) return;
    try {
      const r = await api('/bets', {
        method: 'POST',
        body: { round_id: state.round.id, seat, amount: state.stake },
=======
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
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
      });
      state.balance = r.balance;
      state.round = r.round;
      await loadMyBets();
<<<<<<< HEAD
      say(money(state.stake) + ' on ' + nameOf(seat) + '. Good luck.', 'ok');
    } catch (e) { say(e.message, 'err'); }
  }

  async function rebuy() {
    try {
      const r = await api('/users/' + state.userId + '/rebuy', { method: 'POST' });
      state.balance = r.balance;
      say('Fresh bankroll: ' + money(r.balance) + '.', 'ok');
    } catch (e) { say(e.message, 'err'); }
  }

  // ---------------------------------------------------------------- round lifecycle (driven by the poker table)
  // The app opens a round between hands, locks it when the hand is dealt, and settles it with the winner(s).
  const eng = (path, body) => api(path, { method: 'POST', body, headers: { 'X-API-Key': engineKey } });
  const latest = () => api('/rounds/latest');

  // Make sure betting is open. A leftover locked round (page reloaded mid-hand) is cancelled and refunded.
  async function ensureOpen() {
    try {
      let r = await latest();
      // A leftover round can't be reused if it is mid-hand, past its betting window, or for different players.
      const stale = r && (
        r.status === 'locked'
        || (r.status === 'open' && r.closes_at && Date.now() / 1000 >= r.closes_at)
        || (r.status === 'open' && r.players.map((pl) => pl.name).join('|') !== cfg.playerNames.join('|'))
      );
      if (stale) { await eng('/rounds/' + r.id + '/cancel'); r = null; }   // refunds any stakes
      if (!r || r.status !== 'open') await eng('/rounds', { players: cfg.playerNames });
      state.setupError = '';
    } catch (e) {
      state.setupError = e.message;
    }
    await poll();
  }
  async function lockRound() {
    try {
      const r = await latest();
      if (r && r.status === 'open') await eng('/rounds/' + r.id + '/lock');
    } catch { /* offline */ }
    await poll();
  }
  async function settleRound(seats) {
    try {
      const r = await latest();
      if (!r || r.status !== 'locked') return;
      if (seats.length) await eng('/rounds/' + r.id + '/settle', { winner_seats: seats });
      else await eng('/rounds/' + r.id + '/cancel');
      ui.roundId = null;
    } catch { /* offline */ }
    await poll();
  }
  // Place the previous round's bets again (same flies, same amounts) on the round that is open now.
  async function rebet() {
    if (!isOpen() || !state.lastBets.length) return 0;
    let placed = 0;
    for (const b of state.lastBets) {
      try {
        const r = await api('/bets', { method: 'POST', body: { round_id: state.round.id, seat: b.seat, amount: b.amount } });
        state.balance = r.balance;
        state.round = r.round;
        placed++;
      } catch (e) { say(e.message, 'err'); break; }   // e.g. out of chips: keep what fit
    }
    await loadMyBets();
    if (placed) say('Same bets again: ' + placed + (placed === 1 ? ' bet' : ' bets') + ' placed.', 'ok');
    render();
    return placed;
  }

  async function cancelRound() {
    finishOffer(false);
    abortWindow();
    try {
      const r = await latest();
      if (r && (r.status === 'open' || r.status === 'locked')) await eng('/rounds/' + r.id + '/cancel');
    } catch { /* offline */ }
    await poll();
=======
      say('Bet placed: ' + money(state.stake) + ' on ' + nameOf(state.seat) + '.', 'ok');
    } catch (e) {
      say(e.message, 'err');
    }
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
  }

  async function engine(path, body) {
    try {
      await api(path, { method: 'POST', body, headers: { 'X-API-Key': engineKey } });
<<<<<<< HEAD
=======
      say('Done.', 'ok');
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
      await poll();
    } catch (e) { say(e.message, 'err'); }
  }

<<<<<<< HEAD
  // ---------------------------------------------------------------- betting window + "!" prompt
  // phase: 'hidden' (UI tucked away) | 'open' (countdown running, bets allowed) | 'prompt' (the "!" is up)
  // CSS reads it from <html data-bet="...">, which is what drives the slide animations.
  const ui = { phase: 'hidden', endsAt: 0, windowTimer: 0, clock: 0, promise: null, resolve: null,
    offerTimer: 0, offerResolve: null, roundId: null };
  document.documentElement.dataset.bet = 'hidden';

  function setPhase(p) {
    ui.phase = p;
    document.documentElement.dataset.bet = p;
    render();
  }

  // A fresh round for a new window. Anything still open or locked is cancelled (and refunded) first.
  async function openRound() {
    try {
      const r = await latest();
      if (r && (r.status === 'open' || r.status === 'locked')) await eng('/rounds/' + r.id + '/cancel');
      await eng('/rounds', { players: cfg.playerNames });
      state.setupError = '';
    } catch (e) {
      state.setupError = e.message;
      await poll();
      return false;
    }
    await poll();
    return true;
  }

  // Slide the betting UI up and count down. Resolves ('expired' | 'skipped' | 'locked' | 'aborted')
  // once the window is over and the round is locked. stillWanted() lets the caller back out
  // if the situation changed while the round was being created.
  async function openWindow({ seconds = cfg.windowSeconds, stillWanted } = {}) {
    if (stillWanted && !stillWanted()) return 'aborted';
    finishOffer(false);
    abortWindow();
    if (!(await openRound())) return 'offline';
    if (stillWanted && !stillWanted()) { await cancelRound(); return 'aborted'; }
    ui.roundId = state.round && state.round.id;
    ui.endsAt = Date.now() + seconds * 1000;
    ui.promise = new Promise((resolve) => { ui.resolve = resolve; });
    ui.windowTimer = setTimeout(() => endWindow('expired'), seconds * 1000);
    ui.clock = setInterval(updateTimer, 200);
    timerBox.style.setProperty('--ms', seconds * 1000 + 'ms');
    timerBar.style.animation = 'none'; void timerBar.offsetWidth; timerBar.style.animation = '';   // restart the drain
    updateTimer();
    setPhase('open');
    return ui.promise;
  }

  // Timer ran out, Skip was pressed, or the hand is being dealt: lock the round and slide the UI away.
  async function endWindow(reason) {
    if (ui.phase !== 'open') return;
    clearTimeout(ui.windowTimer); clearInterval(ui.clock);
    const done = ui.resolve; ui.resolve = null;
    setPhase('hidden');
    await lockRound();
    if (done) done(reason);
  }

  // Drop a window without locking (a new round or a cancel is about to replace it).
  function abortWindow() {
    clearTimeout(ui.windowTimer); clearInterval(ui.clock);
    const done = ui.resolve; ui.resolve = null;
    if (ui.phase === 'open') setPhase('hidden');
    if (done) done('aborted');
  }

  // Auto-play: pop up the "!" for `ms`. Resolves true if it was clicked in time.
  function offer(ms = cfg.promptMs) {
    finishOffer(false);
    return new Promise((resolve) => {
      ui.offerResolve = resolve;
      alertBtn.style.setProperty('--ms', ms + 'ms');
      setPhase('prompt');
      ui.offerTimer = setTimeout(() => finishOffer(false), ms);
    });
  }
  function finishOffer(clicked) {
    clearTimeout(ui.offerTimer);
    const done = ui.offerResolve; ui.offerResolve = null;
    if (ui.phase === 'prompt') setPhase('hidden');
    if (done) done(clicked);
  }

  const lockNow = () => (ui.phase === 'open' ? endWindow('locked') : lockRound());

  function updateTimer() {
    if (ui.phase !== 'open') return;
    const secs = Math.max(0, Math.ceil((ui.endsAt - Date.now()) / 1000));
    timerNum.textContent = secs + 's';
    timerBox.dataset.low = String(secs <= 3);
  }

  // ---------------------------------------------------------------- DOM: dock bar (bankroll + chips)
  const barHost = document.querySelector('[data-bet-bar]');
  const betline = document.querySelector('[data-betline]');

  const bankAmt = el('strong', 'bet-bank-amt');
  const bankMine = el('span', 'bet-bank-mine');
  const bank = el('div', 'bet-bank');
  bank.append(el('span', 'bet-bank-label', 'Bankroll'), bankAmt, bankMine);

  const chipRow = el('div', 'bet-chips');
  chipRow.setAttribute('role', 'radiogroup');
  chipRow.setAttribute('aria-label', 'Bet size');
  const chipEls = CHIPS.map((c) => {
    const b = el('button', 'bet-chip');
    b.type = 'button';
    b.dataset.tier = String(c / 100);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', 'Chip ' + money(c));
    b.append(el('span', 'bet-chip-face', money(c)));
    b.addEventListener('click', () => { state.stake = c; render(); });
    chipRow.append(b);
    return { c, b };
  });

  const rebuyBtn = el('button', 'bet-rebuy', 'Out of chips · rebuy');
  rebuyBtn.type = 'button';
  rebuyBtn.addEventListener('click', rebuy);

  // countdown + Skip, shown while a window is open
  const timerNum = el('strong', 'bet-timer-num', '10s');
  const timerBar = el('div', 'bet-timer-bar');
  timerBar.append(el('i'));
  const skipBtn = el('button', 'bet-skip', 'Skip');
  skipBtn.type = 'button';
  skipBtn.setAttribute('aria-label', 'Skip the countdown and close betting');
  skipBtn.addEventListener('click', () => endWindow('skipped'));
  const timerBox = el('div', 'bet-timer');
  timerBox.append(el('span', 'bet-timer-label', 'Bets close in'), timerNum, timerBar, skipBtn);

  // everything that slides away between windows
  const panel = el('div', 'bet-panel');
  panel.append(timerBox, chipRow, rebuyBtn);

  // the "!" shown during auto-play when a new bet can be placed
  const SVG = 'http://www.w3.org/2000/svg';
  const ring = document.createElementNS(SVG, 'svg');
  ring.setAttribute('viewBox', '0 0 56 56');
  ring.setAttribute('aria-hidden', 'true');
  const ringCircle = document.createElementNS(SVG, 'circle');
  ringCircle.setAttribute('cx', '28'); ringCircle.setAttribute('cy', '28'); ringCircle.setAttribute('r', '25');
  ring.append(ringCircle);
  const alertBtn = el('button', 'bet-alert');
  alertBtn.type = 'button';
  alertBtn.hidden = true;
  alertBtn.title = 'A new bet can be placed';
  alertBtn.setAttribute('aria-label', 'A new bet can be placed. Click to bet.');
  alertBtn.append(ring, el('span', 'bet-alert-mark', '!'));
  alertBtn.addEventListener('click', () => finishOffer(true));

  if (barHost) barHost.append(bank, panel, alertBtn);

  // ---------------------------------------------------------------- DOM: overlay (toast, result, dev)
  const overlay = el('div', 'bet-overlay');
  const toast = el('p', 'bet-toast');
  toast.setAttribute('role', 'status');
  const banner = el('div', 'bet-banner');
  const bTitle = el('h3', 'bet-banner-title');
  const bBig = el('p', 'bet-banner-big');
  const bSub = el('p', 'bet-banner-sub');
  banner.append(bTitle, bBig, bSub);
  banner.addEventListener('click', () => { clearResult(); render(); });
  overlay.append(toast, banner);

  if (cfg.dev) {
    const dev = el('details', 'bet-dev');
    dev.append(el('summary', '', 'Test controls'));
    const key = el('input', 'bet-dev-field');
    key.placeholder = 'Engine API key'; key.value = engineKey;
    key.addEventListener('input', () => { engineKey = key.value; });
    const winner = el('select', 'bet-dev-field');
    for (let s = 1; s <= seatCount; s++) winner.append(new Option('Winner: ' + cfg.playerNames[s - 1], s));
    const mk = (label, fn) => {
      const b = el('button', 'bet-dev-btn', label); b.type = 'button'; b.addEventListener('click', fn); return b;
=======
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
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
    };
    dev.append(
      key,
      mk('New round', () => engine('/rounds', { players: cfg.playerNames })),
      mk('Lock', () => engine('/rounds/' + state.round.id + '/lock')),
      winner,
      mk('Settle', () => engine('/rounds/' + state.round.id + '/settle', { winner_seats: [Number(winner.value)] })),
      mk('Cancel', () => engine('/rounds/' + state.round.id + '/cancel')),
<<<<<<< HEAD
      mk('Add $100', async () => {
        try {
          const r = await api('/users/' + state.userId + '/deposit', { method: 'POST', body: { amount: 10000 } });
          state.balance = r.balance; render();
        } catch (e) { say(e.message, 'err'); }
      }),
    );
    overlay.append(dev);
  }
  document.body.append(overlay);

  // ---------------------------------------------------------------- DOM: per-seat bet cards
  // Cards live inside the poker dock, which panels.js owns. Build their contents on demand so they
  // survive the dock being rebuilt (e.g. after Reset).
  function ensureCard(seat) {
    const slot = document.querySelector('[data-bet-seat="' + seat + '"]');
    if (!slot) return null;
    if (!slot._bet) {
      const odds = el('span', 'bet-odds');
      const pool = el('span', 'bet-pool');
      const mine = el('span', 'bet-mine');
      const btn = el('button', 'bet-btn');
      btn.type = 'button';
      btn.addEventListener('click', () => placeBet(seat));
      const head = el('div', 'bet-head');
      head.append(odds, pool);
      slot.append(head, btn, mine);
      slot._bet = { odds, pool, mine, btn };
    }
    return slot;
  }

  document.addEventListener('seats-built', () => render());

  // ---------------------------------------------------------------- render
  function render() {
    const r = state.round;
    const open = isOpen();
    const left = ui.phase === 'open' ? Math.max(0, Math.ceil((ui.endsAt - Date.now()) / 1000)) : null;
    const phase = !state.online ? 'offline' : r ? r.status : 'idle';

    // header line
    if (betline) {
      const label = !state.online ? 'Betting offline: cannot reach ' + cfg.apiBase
        : state.setupError ? 'Could not open a round: ' + state.setupError
        : ui.phase === 'prompt' ? 'A new bet can be placed: click the !'
        : !r ? 'Betting: waiting for the next round'
        : r.status === 'open' && ui.phase !== 'open' ? 'Bets closed'
        : r.status === 'open' ? 'Place your bets'
        : r.status === 'locked' ? 'Bets locked'
        : r.status === 'settled' ? 'Round settled'
        : 'Round called off';
      const bits = [label];
      if (left !== null) bits.push(left + 's');
      if (r && r.total_pool) bits.push('Bet pool ' + money(r.total_pool));
      betline.textContent = bits.join(' · ');
      betline.dataset.phase = phase;
    }

    // bankroll + chips
    const total = state.myBets.reduce((s, b) => s + b.amount, 0);
    bankAmt.textContent = state.online ? money(state.balance) : '–';
    bankMine.textContent = total ? money(total) + ' in play' : '';
    chipEls.forEach(({ c, b }) => {
      b.classList.toggle('is-on', state.stake === c);
      b.setAttribute('aria-checked', String(state.stake === c));
    });
    const broke = state.online && state.balance < MIN_BET && !hasActiveBets();
    rebuyBtn.hidden = !broke;
    alertBtn.hidden = ui.phase !== 'prompt';
    panel.toggleAttribute('inert', ui.phase !== 'open');

    // per-seat cards
    const mineBySeat = {};
    state.myBets.forEach((b) => { mineBySeat[b.seat] = (mineBySeat[b.seat] || 0) + b.amount; });
    const canAfford = state.stake <= state.balance && state.stake >= MIN_BET && state.stake <= MAX_BET;

    for (let seat = 1; seat <= seatCount; seat++) {
      const slot = ensureCard(seat);
      if (!slot) continue;
      const c = slot._bet;
      const info = r && r.players && r.players[seat - 1];
      c.odds.textContent = info && info.odds ? info.odds.toFixed(2) + 'x' : '–';
      c.pool.textContent = info && info.pool ? money(info.pool) + ' backed' : 'No bets yet';
      c.mine.textContent = mineBySeat[seat] ? 'Your bet ' + money(mineBySeat[seat]) : '';
      slot.classList.toggle('has-mine', !!mineBySeat[seat]);
      slot.toggleAttribute('inert', ui.phase !== 'open');

      c.btn.disabled = !(open && canAfford);
      c.btn.textContent = !state.online ? 'Offline'
        : !r ? 'No round'
        : !open ? 'Closed'
        : !canAfford ? 'Low chips'
        : 'Bet ' + money(state.stake);
      c.btn.setAttribute('aria-label', open ? 'Bet ' + money(state.stake) + ' on ' + nameOf(seat) : nameOf(seat) + ': bets closed');
    }

    toast.textContent = state.toast;
    toast.dataset.kind = state.toastKind;
    toast.hidden = !state.toast;

    banner.hidden = !state.result;
    if (state.result) {
      banner.dataset.kind = state.result.kind;
      bTitle.textContent = state.result.title;
      bBig.textContent = state.result.big;
      bSub.textContent = state.result.sub;
    }
  }

  // ---------------------------------------------------------------- start
  render();
  poll();
  setInterval(poll, cfg.pollMs);
  setInterval(render, 1000);

  return {
    refresh: poll,
    render,
    ensureOpen,
    openWindow,
    offer,
    cancelOffer: () => finishOffer(false),
    waitWindow: () => ui.promise || Promise.resolve('closed'),
    get windowOpen() { return ui.phase === 'open'; },
    get readyToDeal() { return !!state.round && state.round.status === 'locked' && state.round.id === ui.roundId; },
    lock: lockNow,
    settle: settleRound,
    cancel: cancelRound,
    rebet,
    forget: () => { state.lastBets = []; },
    isOpen,
    get online() { return state.online; },
    onRoundUpdate: (fn) => listeners.push(fn),
    get round() { return state.round; },
  };
=======
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
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
}
