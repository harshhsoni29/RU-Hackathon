// Fly Poker betting, merged into the main HUD.
//
// There is no separate betting screen any more. panels.js builds one column per fly in the
// dock: a bet card on top ([data-bet-seat="N"]) and the fly's name plate underneath. This module
// fills those bet cards with the house's fixed odds, a one-click "Bet" button and a "−" to take
// money back, and adds a bankroll / chip picker / "Clear bets" to the dock ([data-bet-bar]) and
// the round status to the header ([data-betline]). A winning bet pays stake x odds (split pots
// divide that by the number of winners). Each card also shows how many NPC bettors are on that fly.
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
// up a "!" for 3 s instead; click it in time and a window opens, otherwise play carries on.

const DEFAULTS = {
  apiBase: 'http://127.0.0.1:8000',
  playerNames: [],
  pollMs: 600,           // fast enough that NPC bets visibly trickle in
  windowSeconds: 10,     // length of a betting window
  promptMs: 3000,        // how long the "!" stays up during auto-play
  dev: new URLSearchParams(location.search).has('dev'),
};

const CHIPS = [100, 500, 2500, 10000, 50000];   // cents: $1 $5 $25 $100 $500
const MIN_BET = 100;
const MAX_BET = 1_000_000;

const money = (c) => '$' + (c / 100).toFixed(2).replace(/\.00$/, '');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function initBetting(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
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
      } catch { /* backend was reset or user missing: create a new one */ }
    }
    const name = 'guest-' + Math.random().toString(36).slice(2, 8);
    const u = await api('/users', { method: 'POST', body: { username: name } });
    localStorage.setItem('flypoker.userId', String(u.id));
    state.userId = u.id;
    state.balance = u.balance;           // the server grants the starting bankroll
  }

  async function loadMyBets() {
    if (!state.round) { state.myBets = []; return; }
    const all = await api('/users/' + state.userId + '/bets');
    state.myBets = all.filter((b) => b.round_id === state.round.id);
  }

  async function poll() {
    try {
      if (!state.userId) await ensureUser();
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
    }
    render();
  }

  // ---------------------------------------------------------------- feedback
  function say(text, kind = '') {
    state.toast = text; state.toastKind = kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = ''; render(); }, 3500);
    render();
  }

  function clearResult() { clearTimeout(resultTimer); state.result = null; }

  function showResult() {
    const r = state.round;
    if (!state.myBets.length) return;
    const staked = state.myBets.reduce((s, b) => s + b.amount, 0);
    const paid = state.myBets.reduce((s, b) => s + (b.payout || 0), 0);
    const winners = (r.winner_seats || []).map((s) => r.players[s - 1].name).join(' & ');
    if (r.status === 'cancelled') {
      state.result = { kind: 'refund', title: 'Hand called off', big: money(staked), sub: 'Your stake is back in your bankroll.' };
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
      });
      state.balance = r.balance;
      state.round = r.round;
      await loadMyBets();
      say(money(state.stake) + ' on ' + nameOf(seat) + '. Good luck.', 'ok');
    } catch (e) { say(e.message, 'err'); }
  }

  // Take money back while the window is open: `amount` off one fly, a whole fly, or (no seat) everything.
  async function withdraw(seat, amount) {
    if (!isOpen()) return;
    try {
      const r = await api('/rounds/' + state.round.id + '/withdraw', { method: 'POST', body: { seat, amount } });
      state.balance = r.balance;
      state.round = r.round;
      await loadMyBets();
      say(money(r.withdrawn) + (seat ? ' taken off ' + nameOf(seat) : ' back: all bets cleared') + '.', 'ok');
    } catch (e) { say(e.message, 'err'); }
  }

  async function setBalance(amount) {
    try {
      const r = await api('/users/' + state.userId + '/set-balance', { method: 'POST', body: { amount } });
      state.balance = r.balance;
      say('Test bankroll: ' + money(r.balance) + '.', 'ok');
      render();
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
  }

  async function engine(path, body) {
    try {
      await api(path, { method: 'POST', body, headers: { 'X-API-Key': engineKey } });
      await poll();
    } catch (e) { say(e.message, 'err'); }
  }

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
  async function openRound(seconds = cfg.windowSeconds) {
    try {
      const r = await latest();
      if (r && (r.status === 'open' || r.status === 'locked')) await eng('/rounds/' + r.id + '/cancel');
      await eng('/rounds', { players: cfg.playerNames, window_seconds: seconds });   // NPCs spread their bets over this long
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
    if (!(await openRound(seconds))) return 'offline';
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
  const walletBtn = el('button', 'bet-wallet-btn', '+');
  walletBtn.type = 'button';
  walletBtn.title = 'Test money';
  walletBtn.setAttribute('aria-label', 'Test money');
  walletBtn.setAttribute('aria-expanded', 'false');
  bank.append(el('span', 'bet-bank-label', 'Bankroll'), bankAmt, walletBtn, bankMine);

  // test-money popover; lives on <body> because the dock clips overflow
  const wallet = el('div', 'bet-wallet');
  wallet.hidden = true;
  wallet.append(el('p', 'bet-wallet-title', 'Test money'));
  for (const [label, fn] of [
    ['Reset to $1,000', () => setBalance(100000)],
    ['+ $1,000', () => setBalance(state.balance + 100000)],
    ['+ $10,000', () => setBalance(state.balance + 1000000)],
    ['Set to $0', () => setBalance(0)],
  ]) {
    const b = el('button', 'bet-wallet-opt', label);
    b.type = 'button';
    b.addEventListener('click', () => { fn(); toggleWallet(false); });
    wallet.append(b);
  }
  document.body.append(wallet);
  function toggleWallet(show = wallet.hidden) {
    wallet.hidden = !show;
    walletBtn.setAttribute('aria-expanded', String(show));
    if (!show) return;
    const r = walletBtn.getBoundingClientRect();
    wallet.style.left = Math.round(r.left) + 'px';
    wallet.style.bottom = Math.round(innerHeight - r.top + 8) + 'px';
  }
  walletBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleWallet(); });
  document.addEventListener('click', (e) => { if (!wallet.hidden && !wallet.contains(e.target)) toggleWallet(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleWallet(false); });

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
  const skipBtn = el('button', 'bet-skip', 'Lock in bets');
  skipBtn.type = 'button';
  skipBtn.setAttribute('aria-label', 'Keep the current bets and close betting now');
  skipBtn.addEventListener('click', () => endWindow('skipped'));
  const timerBox = el('div', 'bet-timer');
  timerBox.append(el('span', 'bet-timer-label', 'Bets close in'), timerNum, timerBar);

  const clearBtn = el('button', 'bet-clear', 'Clear bets');
  clearBtn.type = 'button';
  clearBtn.addEventListener('click', () => withdraw());

  // everything that slides away between windows
  const panel = el('div', 'bet-panel');
  panel.append(rebuyBtn, chipRow);

  // countdown, "Clear bets" and "Lock in bets" sit in the header under the round status
  const lockRow = el('div', 'bet-lock');
  lockRow.append(clearBtn, timerBox, skipBtn);

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
  if (betline) betline.after(lockRow);

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
    };
    dev.append(
      key,
      mk('New round', () => engine('/rounds', { players: cfg.playerNames })),
      mk('Lock', () => engine('/rounds/' + state.round.id + '/lock')),
      winner,
      mk('Settle', () => engine('/rounds/' + state.round.id + '/settle', { winner_seats: [Number(winner.value)] })),
      mk('Cancel', () => engine('/rounds/' + state.round.id + '/cancel')),
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
      const mineText = el('span');
      const less = el('button', 'bet-less', '−');
      less.type = 'button';
      less.addEventListener('click', () => {
        const staked = state.myBets.filter((b) => b.seat === seat).reduce((s, b) => s + b.amount, 0);
        withdraw(seat, Math.min(state.stake, staked));
      });
      const mine = el('div', 'bet-mine');
      mine.append(mineText, less);
      const btn = el('button', 'bet-btn');
      btn.type = 'button';
      btn.addEventListener('click', () => placeBet(seat));
      const head = el('div', 'bet-head');
      head.append(odds, pool);
      slot.append(head, btn, mine);
      slot._bet = { odds, pool, mine, mineText, less, btn };
    }
    return slot;
  }

  document.addEventListener('seats-built', () => render());

  // ---------------------------------------------------------------- render
  function render() {
    const r = state.round;
    const open = isOpen();
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
      betline.textContent = label;
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
    clearBtn.hidden = !(open && total);
    alertBtn.hidden = ui.phase !== 'prompt';
    panel.toggleAttribute('inert', ui.phase !== 'open');
    lockRow.hidden = ui.phase !== 'open';

    // per-seat cards
    const mineBySeat = {};
    state.myBets.forEach((b) => { mineBySeat[b.seat] = (mineBySeat[b.seat] || 0) + b.amount; });
    const canAfford = state.stake <= state.balance && state.stake >= MIN_BET && state.stake <= MAX_BET;

    for (let seat = 1; seat <= seatCount; seat++) {
      const slot = ensureCard(seat);
      if (!slot) continue;
      const c = slot._bet;
      const info = r && r.players && r.players[seat - 1];
      const odds = info && info.odds;
      const pays = (stake) => money(Math.floor(stake * Math.round(odds * 100) / 100));
      c.odds.textContent = odds ? odds.toFixed(2) : '–';
      const crowd = (info && info.npcs) || 0;   // NPC bettors backing this fly
      c.pool.textContent = odds ? money(state.stake) + ' pays ' + pays(state.stake) + ' · ' + crowd + (crowd === 1 ? ' NPC' : ' NPCs') : '';
      c.pool.title = crowd + (crowd === 1 ? ' NPC has' : ' NPCs have') + ' bet on ' + nameOf(seat);
      c.mineText.textContent = mineBySeat[seat] ? 'Your bet ' + money(mineBySeat[seat]) + (odds ? ' · pays ' + pays(mineBySeat[seat]) : '') : '';
      c.mine.hidden = !mineBySeat[seat];
      c.less.disabled = !open;
      c.less.setAttribute('aria-label', 'Take ' + money(Math.min(state.stake, mineBySeat[seat] || 0)) + ' off ' + nameOf(seat));
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
}
