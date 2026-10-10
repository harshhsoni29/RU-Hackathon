/** Title card. Play stays blocked until the rail control is used. */

const LOGO = `
<svg class="logo" viewBox="0 0 240 200" aria-hidden="true">
  <g transform="translate(120 112)">
    ${[-36, -18, 0, 18, 36].map((angle, i) => `
      <g transform="rotate(${angle}) translate(0 -46)">
        <rect x="-22" y="-32" width="44" height="64" rx="5" fill="#fbf6ec" stroke="#2a1a12" stroke-width="1.5"/>
        <text x="-15" y="-15" font-size="15" font-family="Georgia,serif" font-weight="700"
          fill="${i % 2 ? '#c23b22' : '#1c1410'}">${i < 3 ? 'K' : '7'}</text>
        <text x="0" y="14" font-size="22" text-anchor="middle"
          fill="${i % 2 ? '#c23b22' : '#1c1410'}">${['♠', '♥', '♣', '♦', '♠'][i]}</text>
      </g>`).join('')}
    <circle r="40" fill="#1f7a4d" stroke="#e6c27a" stroke-width="3"/>
    <circle r="40" fill="none" stroke="#f6efe4" stroke-width="7" stroke-dasharray="10 11"/>
    <circle r="28" fill="none" stroke="#e6c27a" stroke-width="1.5" stroke-dasharray="3 4"/>
    <g class="logo-fly">
      <ellipse cx="-13" cy="-6" rx="14" ry="7" fill="rgba(220,240,255,0.75)" stroke="#9fc4dc" transform="rotate(-25 -13 -6)"/>
      <ellipse cx="13" cy="-6" rx="14" ry="7" fill="rgba(220,240,255,0.75)" stroke="#9fc4dc" transform="rotate(25 13 -6)"/>
      <ellipse cx="0" cy="6" rx="8" ry="13" fill="#2b2420"/>
      <circle cx="0" cy="-11" r="7" fill="#2b2420"/>
      <circle cx="-5" cy="-13" r="4" fill="#b8231a"/>
      <circle cx="5" cy="-13" r="4" fill="#b8231a"/>
      <path d="M-8 -20 L-3 -28 L3 -28 L8 -20 Z" fill="#1c1410"/>
      <rect x="-10" y="-21" width="20" height="2.5" rx="1" fill="#1c1410"/>
    </g>
  </g>
</svg>`;

export function mountTitle(onEnter) {
  const root = document.createElement('section');
  root.id = 'title';
  root.innerHTML = `
    <div class="card">
      ${LOGO}
      <p class="eyebrow">Live from the rail</p>
      <h1>Full House<span>-flies</span></h1>
      <p>Six flies are already in their chairs, each with a small brain that rewires itself after every hand. One of them only copies the others. You are on the rail, watching a game you are not in.</p>
      <ul>
        <li><i style="background:#1f7a4d"></i> Vera</li>
        <li><i style="background:#d4892a"></i> Buzz</li>
        <li><i style="background:#3d5a80"></i> Nib</li>
        <li><i style="background:#d4537e"></i> Callie</li>
        <li><i style="background:#c23b22"></i> Mani</li>
        <li><i style="background:#7b5cd6"></i> Soni</li>
      </ul>
      <button type="button" data-enter>Take the rail</button>
    </div>
  `;
  document.body.appendChild(root);
  const button = root.querySelector('[data-enter]');
  button.addEventListener('click', () => {
    root.hidden = true;
    onEnter();
  });
  return {
    root,
    isOpen() {
      return !root.hidden;
    },
  };
}
