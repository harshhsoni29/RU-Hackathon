/** Spectator rail. Each well is an empty mount for a later bet control. */

const FLY_IDS = ['vera', 'buzz', 'nib', 'callie', 'mani'];

const NAMES = {
  vera: 'Vera',
  buzz: 'Buzz',
  nib: 'Nib',
  callie: 'Callie',
  mani: 'Mani',
};

const CSS = `
#bet-rail {
  position: fixed;
  z-index: 2;
  right: 16px;
  top: calc(92px + 34vh + 12px);
  bottom: 100px;
  width: min(220px, 28vw);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  pointer-events: none;
  color: var(--ink, #f6efe4);
  font-family: "Avenir Next", "Segoe UI", sans-serif;
}
#bet-rail .bet-rail-panel {
  pointer-events: auto;
  max-height: 100%;
  overflow: auto;
  padding: 10px 10px 12px;
  background: rgba(14, 9, 7, 0.94);
  border: 1px solid rgba(230, 194, 122, 0.38);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}
#bet-rail .bet-rail-kicker {
  margin: 0 4px 8px;
  color: var(--brass, #e6c27a);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-size: 11px;
}
#bet-rail .bet-slots {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
#bet-rail .bet-slot {
  padding: 7px 8px 8px 10px;
  border-radius: 10px;
  border-left: 3px solid var(--fly, #e6c27a);
  background: rgba(255, 255, 255, 0.035);
}
#bet-rail .bet-slot[data-fly="vera"] { --fly: #1f7a4d; }
#bet-rail .bet-slot[data-fly="buzz"] { --fly: #d4892a; }
#bet-rail .bet-slot[data-fly="nib"] { --fly: #3d5a80; }
#bet-rail .bet-slot[data-fly="callie"] { --fly: #d4537e; }
#bet-rail .bet-slot[data-fly="mani"] { --fly: #c23b22; }
#bet-rail .bet-slot-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
#bet-rail .bet-name {
  font-family: Palatino, Georgia, serif;
  font-weight: 600;
  font-size: 16px;
  letter-spacing: 0.03em;
}
#bet-rail .bet-stack {
  color: var(--brass, #e6c27a);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 15px;
}
#bet-rail .bet-well {
  box-sizing: border-box;
  min-height: 46px;
  margin-top: 6px;
  border-radius: 9px;
  border: 1px dashed rgba(230, 194, 122, 0.55);
  background: rgba(0, 0, 0, 0.38);
  box-shadow: inset 0 3px 10px rgba(0, 0, 0, 0.55);
}
@media (max-width: 800px) {
  #bet-rail {
    left: 8px;
    right: 8px;
    top: auto;
    bottom: 112px;
    width: auto;
    justify-content: flex-end;
  }
  #bet-rail .bet-slots {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
  #bet-rail .bet-name { font-size: 13px; }
  #bet-rail .bet-stack { font-size: 12px; }
  #bet-rail .bet-well { min-height: 36px; }
}
`;

function slotMarkup(id) {
  const name = NAMES[id];
  return `<li class="bet-slot" data-fly="${id}">
      <div class="bet-slot-meta">
        <span class="bet-name">${name}</span>
        <span class="bet-stack" data-stack>—</span>
      </div>
      <div class="bet-well" data-bet-slot="${id}" aria-label="${name} bet well"></div>
    </li>`;
}

export function mountRail() {
  if (!document.getElementById('bet-rail-style')) {
    const style = document.createElement('style');
    style.id = 'bet-rail-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const root = document.createElement('aside');
  root.id = 'bet-rail';
  root.setAttribute('aria-label', 'Spectator rail');
  root.innerHTML = `
    <div class="bet-rail-panel">
      <p class="bet-rail-kicker">Rail</p>
      <ol class="bet-slots">
        ${FLY_IDS.map(slotMarkup).join('')}
      </ol>
    </div>
  `;
  document.body.appendChild(root);

  const slots = new Map(FLY_IDS.map((id) => {
    const item = root.querySelector(`[data-fly="${id}"]`);
    return [id, {
      name: item.querySelector('.bet-name'),
      stack: item.querySelector('[data-stack]'),
    }];
  }));

  return {
    root,
    render(state) {
      if (!state || !Array.isArray(state.seats)) return;
      for (const seat of state.seats) {
        const slot = slots.get(seat.id);
        if (!slot) continue;
        if (seat.name) slot.name.textContent = seat.name;
        slot.stack.textContent = Number.isFinite(seat.stack) ? String(seat.stack) : '—';
      }
    },
  };
}
