/** Game HUD: street, pot, log, controls, and the fly inspection panel. */

const STYLE = {
  'tight-aggressive': 'Tight-agg',
  'loose-aggressive': 'Loose-agg',
  'tight-passive': 'Tight-pass',
  'loose-passive': 'Loose-pass',
  maniac: 'Maniac',
};

function el(html) {
  const node = document.createElement('div');
  node.innerHTML = html.trim();
  return node.firstElementChild;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function signed(n) {
  if (!Number.isFinite(n)) return '—';
  const digits = Math.abs(n) >= 0.1 ? 3 : 4;
  const text = n.toFixed(digits);
  return n > 0 ? `+${text}` : text;
}

function prettyParam(parameter) {
  if (parameter.startsWith('gain:')) return parameter.slice(5).replace('->', ' → ');
  if (parameter.startsWith('opp.')) {
    const parts = parameter.split('.');
    return `${parts[1]} ${parts[2] || ''}`.trim();
  }
  return parameter;
}

function formatAction(ev, name) {
  const who = name || ev.flyId;
  let line = who;
  if (ev.action === 'fold') line += ' folds';
  else if (ev.action === 'check') line += ' checks';
  else if (ev.action === 'call') line += ` calls ${ev.amount}`;
  else if (ev.action === 'bet') line += ` bets ${ev.amount}`;
  else if (ev.action === 'raise') line += ` raises to ${ev.raiseTo ?? ev.amount}`;
  else line += ` ${ev.action}`;
  if (ev.allIn) line += ' · all-in';
  return line;
}

function streetLabel(street) {
  if (!street) return 'Waiting';
  return street[0].toUpperCase() + street.slice(1);
}

export function mountHud() {
  const root = el(`
    <div id="hud">
      <header class="top">
        <div class="brand">
          <p class="eyebrow">Full House-flies</p>
          <h1>Hold'em Den</h1>
        </div>
        <div class="status">
          <p class="street" data-street>Waiting</p>
          <p class="sub" data-sub>Click a fly · drag to look around</p>
        </div>
        <div class="potline">
          <p class="pot" data-pot>Pot 0</p>
          <p class="sub" data-note></p>
        </div>
      </header>
      <aside class="log" data-log></aside>
      <aside class="inspect" data-inspect hidden></aside>
      <footer class="dock">
        <div class="controls">
          <button type="button" data-deal>Deal</button>
          <button type="button" data-next>Next action</button>
          <button type="button" data-auto>Auto-play</button>
          <label class="speed">Speed <input type="range" min="1" max="8" value="4" data-speed /> <span data-speed-label>0.6s</span></label>
          <button type="button" data-reset class="ghost">Reset</button>
        </div>
        <div class="stats" data-stats></div>
      </footer>
      <p class="error" data-error hidden></p>
      <p class="hint">Drag to look · scroll to zoom · right-drag to pan</p>
    </div>
  `);
  document.body.appendChild(root);

  const q = (sel) => root.querySelector(sel);
  const speedInput = q('[data-speed]');
  const speedLabel = q('[data-speed-label]');

  function delayMs() {
    const speed = Number(speedInput.value);
    return Math.round(1100 - speed * 120);
  }

  function paintSpeed() {
    speedLabel.textContent = `${(delayMs() / 1000).toFixed(1)}s`;
  }
  speedInput.addEventListener('input', paintSpeed);
  paintSpeed();

  return {
    delayMs,
    onDeal(fn) { q('[data-deal]').addEventListener('click', fn); },
    onNext(fn) { q('[data-next]').addEventListener('click', fn); },
    onAuto(fn) { q('[data-auto]').addEventListener('click', fn); },
    onReset(fn) { q('[data-reset]').addEventListener('click', fn); },
    onSelect(fn) {
      q('[data-stats]').addEventListener('click', (event) => {
        const plate = event.target.closest('[data-fly]');
        if (plate) fn(plate.dataset.fly);
      });
    },
    setAuto(on) {
      const btn = q('[data-auto]');
      btn.textContent = on ? 'Stop' : 'Auto-play';
      btn.classList.toggle('on', on);
    },
    setError(message) {
      const node = q('[data-error]');
      node.hidden = !message;
      node.textContent = message || '';
    },
    render(state) {
      const actor = (state.seats || []).find((s) => s.id === state.actorId);
      q('[data-street]').textContent = state.handLive ? streetLabel(state.street) : 'Between hands';
      q('[data-sub]').textContent = actor
        ? `${actor.name} to act · hand ${state.handNumber}`
        : `Hand ${state.handNumber || 0} · ${state.spectatorNote || 'Spectator view'}`;
      q('[data-pot]').textContent = `Pot ${state.pot || 0}`;
      const winners = state.lastSettlement?.winners || [];
      q('[data-note]').textContent = !state.handLive && winners.length
        ? winners.map((w) => `${w.name} +${w.amount}${w.handName ? ` ${w.handName}` : ''}`).join(' · ')
        : `Blinds ${state.blinds?.small ?? 5} / ${state.blinds?.big ?? 10}`;
      q('[data-deal]').disabled = !state.canDeal;
      q('[data-next]').disabled = !state.handLive;
      renderStats(q('[data-stats]'), state);
      renderLog(q('[data-log]'), state);
    },
    renderInspect(info, open, error) {
      const panel = q('[data-inspect]');
      if (!open || (!info && !error)) {
        panel.hidden = true;
        panel.innerHTML = '';
        return;
      }
      panel.hidden = false;
      panel.innerHTML = error ? `<p class="error">${esc(error)}</p>` : inspectHtml(info);
      panel.querySelector('[data-close]')?.addEventListener('click', () => {
        panel.hidden = true;
        panel.dispatchEvent(new CustomEvent('close-inspect', { bubbles: true }));
      });
    },
    onCloseInspect(fn) {
      q('[data-inspect]').addEventListener('close-inspect', fn);
    },
  };
}

function renderStats(host, state) {
  const selected = host.dataset.selected || '';
  host.innerHTML = (state.seats || []).map((seat) => {
    const wins = seat.stats?.handsWon ?? 0;
    const hands = seat.stats?.handsPlayed ?? 0;
    const accent = `#${(seat.color >>> 0).toString(16).padStart(6, '0')}`;
    const classes = [
      'plate',
      seat.isActor ? 'acting' : '',
      seat.id === selected ? 'picked' : '',
      seat.folded ? 'folded' : '',
    ].filter(Boolean).join(' ');
    return `
      <button type="button" class="${classes}" data-fly="${esc(seat.id)}" style="--fly:${accent}">
        <span class="who">${esc(seat.name)}</span>
        <span class="chips">${seat.stack}</span>
        <span class="meta">${wins}/${hands} · ${esc(STYLE[seat.style] || seat.style)}</span>
      </button>`;
  }).join('');
}

export function markSelected(id) {
  const host = document.querySelector('[data-stats]');
  if (host) host.dataset.selected = id || '';
}

function renderLog(host, state) {
  const names = Object.fromEntries((state.seats || []).map((s) => [s.id, s.name]));
  const events = (state.lastActions || []).slice(-14).reverse();
  if (!events.length) {
    host.innerHTML = '<p class="log-title">Action log</p><p class="empty">No actions yet. Deal a hand.</p>';
    return;
  }
  let lastHand = null;
  const rows = [];
  for (const ev of events) {
    if (ev.handNumber !== lastHand) {
      rows.push(`<p class="hand-break">Hand ${ev.handNumber}</p>`);
      lastHand = ev.handNumber;
    }
    rows.push(`<p><span class="st">${esc(ev.street || '')}</span> ${esc(formatAction(ev, names[ev.flyId]))}</p>`);
  }
  host.innerHTML = `<p class="log-title">Action log</p>${rows.join('')}`;
}

function inspectHtml(info) {
  const play = info.playstyle || {};
  const decision = info.decision;
  const accent = info.colorHex || `#${(info.color >>> 0).toString(16).padStart(6, '0')}`;
  const nums = [
    ['VPIP', play.vpip],
    ['PFR', play.pfr],
    ['Agg', play.aggression],
    ['Bluff', play.bluff],
    ['Fold', play.foldToPressure],
    ['Learn', play.learnRate],
  ];
  const decisionBlock = decision
    ? `<h3>${esc(decision.action || '—')}${decision.amount ? ` ${decision.amount}` : ''}${decision.allIn ? ' · all-in' : ''}</h3>
       <p class="sub">${decision.live ? 'Deciding now' : 'Last decision'} · ${esc(decision.street || '')}${decision.handName ? ` · ${esc(decision.handName)}` : ''}</p>
       <ul>${(decision.reasons || []).map((line) => `<li>${esc(line)}</li>`).join('') || '<li>No reasons recorded.</li>'}</ul>`
    : '<p class="empty">No decision yet. Deal, then step until this fly acts.</p>';
  return `
    <div class="inspect-head" style="--fly:${accent}">
      <div>
        <p class="eyebrow">${esc(info.accessory || '')}</p>
        <h2>${esc(info.name)}</h2>
      </div>
      <button type="button" data-close aria-label="Close">×</button>
    </div>
    <section>
      <h3>${esc(play.label || info.style || 'Playstyle')}</h3>
      <p>${esc(play.summary || '')}</p>
      <div class="meters">${nums.map(([label, value]) => `
        <span><b>${esc(label)}</b> ${Number.isFinite(value) ? value.toFixed(2) : '—'}</span>
      `).join('')}</div>
    </section>
    <section>
      <h3>Decision</h3>
      ${decisionBlock}
    </section>
    <section>
      <h3>Circuit</h3>
      <p class="sub">${esc(info.circuit?.description || 'Sparse learned circuit. Brighter nodes are more active.')}</p>
      ${graphSvg(info)}
    </section>
    <section>
      <h3>Learning</h3>
      ${learningHtml(info.learning)}
    </section>
  `;
}

function graphSvg(info) {
  const nodes = info.nodes || [];
  const activity = info.activity || [];
  const edges = info.edges || [];
  if (!nodes.length) return '<p class="empty">No circuit on this fly.</p>';
  const width = 300;
  const height = 220;
  const cols = new Map();
  for (const node of nodes) {
    if (!cols.has(node.x)) cols.set(node.x, []);
    cols.get(node.x).push(node);
  }
  const colCount = Math.max(1, cols.size);
  const pos = new Map();
  for (const [x, list] of cols) {
    list.sort((a, b) => a.y - b.y);
    list.forEach((node, i) => {
      const px = 18 + (x / Math.max(1, colCount - 1)) * (width - 36);
      const py = 22 + ((i + 0.5) / list.length) * (height - 40);
      pos.set(node.id, [px, py, node]);
    });
  }
  let maxA = 0.2;
  for (const value of activity) if (value > maxA) maxA = value;
  const lines = edges.map((edge) => {
    const a = pos.get(edge.from);
    const b = pos.get(edge.to);
    if (!a || !b) return '';
    const hot = edge.sign < 0 ? '#e05a4f' : 'rgba(230, 194, 122, 0.45)';
    const widthPx = 0.6 + Math.min(2.2, Math.abs(edge.gain || 0));
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${hot}" stroke-width="${widthPx}" />`;
  }).join('');
  const dots = nodes.map((node, i) => {
    const at = pos.get(node.id);
    if (!at) return '';
    const level = Math.max(0, Math.min(1, (activity[i] || 0) / maxA));
    const r = 3.2 + level * 5;
    const fill = level > 0.45 ? '#ffe1a8' : level > 0.15 ? '#e0a15a' : '#6d6258';
    return `<circle cx="${at[0]}" cy="${at[1]}" r="${r}" fill="${fill}"><title>${esc(node.label)} · ${((activity[i] || 0)).toFixed(2)}</title></circle>`;
  }).join('');
  const labels = [...cols.keys()].sort((a, b) => a - b).map((x) => {
    const sample = cols.get(x)[0];
    const px = 18 + (x / Math.max(1, colCount - 1)) * (width - 36);
    return `<text x="${px}" y="14" text-anchor="middle" fill="#b7aa9a" font-size="9">${esc(sample.layer)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" class="graph" role="img" aria-label="Sparse neural graph">${lines}${dots}${labels}</svg>`;
}

function learningHtml(learning) {
  const last = learning?.last;
  if (!last) return '<p class="empty">No completed hand yet.</p>';
  const chips = signed(last.chipsDelta);
  const rows = (last.deltas || []).map((row) => `
    <li>
      <span class="delta ${row.delta > 0 ? 'up' : 'down'}">${signed(row.delta)}</span>
      <span>
        <b>${esc(prettyParam(row.parameter))}</b>
        ${Number.isFinite(row.before) ? `${row.before.toFixed(3)} → ${row.after.toFixed(3)}` : ''}
        <small>${esc(row.why || '')}</small>
      </span>
    </li>`).join('');
  return `
    <p>${esc(last.summary || '')}</p>
    <p class="sub">Hand ${last.handNumber} · chips ${chips}${Number.isFinite(last.reward) ? ` · reward ${last.reward.toFixed(3)}` : ''}</p>
    <ul class="deltas">${rows || '<li>No numeric change recorded.</li>'}</ul>
  `;
}
