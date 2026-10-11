// Wing shop: a permanent meta-progression layer.
//
// A "run" starts when the player takes the rail and ends when they go broke. When a run ends they
// earn fly wings: one per $1,000 of the highest bankroll they reached during the run (rounded down).
// Wings buy upgrades that persist across runs (localStorage) and make later runs easier.
//
//   const shop = createShop();
//   shop.mods.winBonus        // fraction added to winnings
//   shop.openShop();          // show the shop modal
//   shop.endRun(peakCents)    // award wings, returns { wings, total }

const KEY = 'flypoker.shop.v1';
const WING_UNIT = 100000;   // cents: $1,000 of peak bankroll per wing

export const BASE_BANKROLL = 100000;   // cents, matches the backend's STARTING_BALANCE

export const UPGRADES = [
  {
    id: 'wallet', icon: '👛', name: 'Fat Wallet', max: 5, costs: [2, 3, 5, 8, 12],
    desc: (lv) => `Start every run with +$${250 * lv} extra.`,
    step: 'Starting bankroll +$250',
  },
  {
    id: 'lucky', icon: '🍀', name: 'Lucky Payout', max: 5, costs: [3, 5, 8, 12, 18],
    desc: (lv) => `Winning bets pay ${lv * 10}% more profit.`,
    step: 'Money earned +10%',
  },
  {
    id: 'insurance', icon: '🛟', name: 'Fly Insurance', max: 5, costs: [3, 5, 8, 12, 18],
    desc: (lv) => `Get ${lv * 5}% of every lost stake refunded.`,
    step: 'Lost stakes refunded +5%',
  },
  {
    id: 'pocket', icon: '🪙', name: 'Pocket Change', max: 1, costs: [6],
    desc: () => 'Find $50 on the floor before every betting round.',
    step: 'One-time: +$50 free money per round',
  },
  {
    id: 'magnet', icon: '🧲', name: 'Wing Magnet', max: 1, costs: [10],
    desc: () => 'Earn 30% more wings at the end of every run.',
    step: 'One-time: wings earned +30%',
  },
  {
    id: 'wind', icon: '💨', name: 'Second Wind', max: 1, costs: [12],
    desc: () => 'Survive going broke once per run with a fresh $500.',
    step: 'One-time: an extra life every run',
  },
];

const money = (c) => '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });

function load() {
  const fresh = { wings: 0, levels: {}, lifetime: 0, runs: 0, best: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') return { ...fresh, ...saved, levels: { ...(saved.levels || {}) } };
  } catch { /* storage blocked or corrupt: start fresh */ }
  return fresh;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const STYLE = `
.shop-wrap { position: fixed; inset: 0; z-index: 9; display: grid; place-items: center; padding: 16px;
  background: rgba(8, 5, 4, 0.78); backdrop-filter: blur(4px); color: #f6efe4; }
.shop-wrap[hidden] { display: none; }
.shop-card { width: min(640px, 100%); max-height: 92vh; overflow: auto; padding: 22px 26px 24px;
  background: rgba(28, 16, 12, 0.96); border: 1px solid rgba(230, 194, 122, 0.4); border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6); }
.shop-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.shop-head h2 { margin: 0; font-family: Palatino, Georgia, serif; font-size: 28px; color: #f3d48f; letter-spacing: 0.06em; }
.shop-wings { font-size: 20px; font-weight: 600; color: #cfe9ff; white-space: nowrap; }
.shop-sub { color: #cbbba6; margin: 6px 0 16px; line-height: 1.4; font-size: 14px; }
.shop-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.shop-item { padding: 12px 14px; border: 1px solid rgba(230, 194, 122, 0.25); border-radius: 12px;
  background: rgba(255, 255, 255, 0.04); display: flex; flex-direction: column; gap: 6px; }
.shop-item h3 { margin: 0; font-size: 16px; display: flex; gap: 8px; align-items: center; }
.shop-item p { margin: 0; font-size: 13px; color: #cbbba6; min-height: 2.6em; line-height: 1.3; }
.shop-item h3 small { margin-left: auto; color: #e6c27a; font-weight: 600; }
.shop-pips { display: flex; gap: 4px; }
.shop-pips i { width: 14px; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.15); }
.shop-pips i.on { background: #e6c27a; }
.shop-buy, .shop-close, .shop-again { font: inherit; cursor: pointer; border-radius: 9px; padding: 8px 14px;
  background: #1f7a4d; color: #f6efe4; border: 1px solid #e6c27a; }
.shop-buy:disabled { opacity: 0.45; cursor: not-allowed; background: #3a3128; }
.shop-foot { display: flex; justify-content: flex-end; margin-top: 18px; gap: 10px; }
.shop-close { background: transparent; }
.run-over { text-align: center; }
.run-over h2 { margin: 0 0 4px; font-family: Palatino, Georgia, serif; font-size: 32px; color: #f3d48f; }
.run-over .big { font-size: 46px; margin: 8px 0 2px; color: #cfe9ff; font-weight: 600; }
.run-over p { color: #cbbba6; margin: 4px 0; line-height: 1.4; }
.run-over .shop-foot { justify-content: center; margin-top: 20px; }
.title-shop { margin-left: 10px; background: #3d5a80 !important; }
`;

export function createShop() {
  const data = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ } };
  const lv = (id) => Math.min(data.levels[id] || 0, UPGRADES.find((u) => u.id === id).max);

  const style = el('style');
  style.textContent = STYLE;
  document.head.append(style);

  // Effects used by the betting logic. Cents unless noted.
  const mods = {
    get startBonus() { return lv('wallet') * 25000; },
    get winBonus() { return lv('lucky') * 0.10; },
    get lossRefund() { return lv('insurance') * 0.05; },
    get roundBonus() { return lv('pocket') * 5000; },
    get wingBonus() { return lv('magnet') * 0.30; },
    get revives() { return lv('wind'); },
  };

  // ------------------------------------------------------------ shop modal
  const wrap = el('div', 'shop-wrap');
  wrap.hidden = true;
  const card = el('div', 'shop-card');
  wrap.append(card);
  document.body.append(wrap);
  wrap.addEventListener('click', (e) => { if (e.target === wrap && mode === 'shop') closeAll(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !wrap.hidden && mode === 'shop') closeAll(); });

  let mode = 'shop';
  let afterClose = null;

  function closeAll() {
    wrap.hidden = true;
    if (afterClose) { const f = afterClose; afterClose = null; f(); }
  }

  function buy(id) {
    const up = UPGRADES.find((u) => u.id === id);
    const level = lv(id);
    if (level >= up.max) return;
    const cost = up.costs[level];
    if (data.wings < cost) return;
    data.wings -= cost;
    data.levels[id] = level + 1;
    save();
    renderShop();
  }

  function renderShop() {
    mode = 'shop';
    card.className = 'shop-card';
    card.replaceChildren();
    const head = el('div', 'shop-head');
    head.append(el('h2', '', 'Wing Shop'), el('span', 'shop-wings', '🪽 ' + data.wings + (data.wings === 1 ? ' wing' : ' wings')));
    card.append(head, el('p', 'shop-sub',
      'Fly wings are earned when a run ends: one per $1,000 of the most money you held during it. ' +
      'Upgrades are permanent and stack on every future run.'));
    const grid = el('div', 'shop-grid');
    for (const up of UPGRADES) {
      const level = lv(up.id);
      const maxed = level >= up.max;
      const item = el('div', 'shop-item');
      const h = el('h3', '', `${up.icon} ${up.name}`);
      h.append(el('small', '', up.max > 1 ? `  ${level}/${up.max}` : level ? '  Owned' : ''));
      item.append(h);
      const pips = el('div', 'shop-pips');
      for (let i = 0; i < up.max; i++) pips.append(el('i', i < level ? 'on' : ''));
      item.append(pips);
      item.append(el('p', '', level ? up.desc(level) + (maxed ? '' : ` Next: ${up.step}.`) : (up.max > 1 ? `${up.step} per level.` : `${up.step}.`)));
      const cost = maxed ? 0 : up.costs[level];
      const b = el('button', 'shop-buy', maxed ? (up.max > 1 ? 'Maxed out' : 'Purchased') : `Buy · 🪽 ${cost}`);
      b.type = 'button';
      b.disabled = maxed || data.wings < cost;
      b.addEventListener('click', () => buy(up.id));
      item.append(b);
      grid.append(item);
    }
    card.append(grid);
    const foot = el('div', 'shop-foot');
    const close = el('button', 'shop-close', 'Close');
    close.type = 'button';
    close.addEventListener('click', closeAll);
    foot.append(close);
    card.append(foot);
  }

  function openShop(onClose) {
    afterClose = onClose || null;
    renderShop();
    wrap.hidden = false;
  }

  // ------------------------------------------------------------ run end
  /** Award wings for a finished run. peak is the highest bankroll reached, in cents. */
  function endRun(peak) {
    const wings = Math.floor((Math.max(0, peak) * (1 + mods.wingBonus)) / WING_UNIT + 1e-9);
    data.wings += wings;
    data.lifetime += wings;
    data.runs += 1;
    data.best = Math.max(data.best, peak);
    save();
    return { wings, total: data.wings };
  }

  /** Run-over screen. onNewRun fires when the player starts another run. */
  function showRunOver({ wings, peak }, onNewRun) {
    mode = 'over';
    card.className = 'shop-card run-over';
    card.replaceChildren();
    card.append(
      el('h2', '', 'Busted'),
      el('p', '', `Your best bankroll this run: ${money(peak)}`),
      el('div', 'big', '🪽 +' + wings),
      el('p', '', wings
        ? `${wings === 1 ? 'A new wing' : wings + ' new wings'} for the shop. You now hold ${data.wings}.`
        : 'No wings this time. Reach $1,000 of bankroll to earn one.'),
    );
    const foot = el('div', 'shop-foot');
    const shopBtn = el('button', 'shop-close', 'Wing Shop');
    shopBtn.type = 'button';
    shopBtn.addEventListener('click', () => openShop(() => showRunOver({ wings, peak }, onNewRun)));
    const again = el('button', 'shop-again', 'Start new run');
    again.type = 'button';
    again.addEventListener('click', () => { wrap.hidden = true; onNewRun(); });
    foot.append(shopBtn, again);
    card.append(foot);
    wrap.hidden = false;
  }

  return {
    mods,
    openShop,
    endRun,
    showRunOver,
    get wings() { return data.wings; },
    money,
  };
}
