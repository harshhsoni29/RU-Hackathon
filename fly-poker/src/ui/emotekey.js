/** Side drawer explaining the faces above each fly. The arrow tab slides it in and out. */

import { emoteImage } from './flies.js';

const KEY = [
  ['check', 'Checked'],
  ['call', 'Called'],
  ['bet', 'Bet'],
  ['raise', 'Raised'],
  ['fold', 'Folded'],
  ['win', 'Won the hand'],
  ['bust', 'Out of chips'],
];
const STORE = 'fly-emote-key-open';

export function mountEmoteKey(host = document.getElementById('hud') || document.body) {
  const root = document.createElement('aside');
  root.className = 'emote-key';
  root.setAttribute('aria-label', 'What the faces mean');

  const panel = document.createElement('div');
  panel.className = 'emote-key-panel';
  panel.id = 'emote-key-panel';
  const title = document.createElement('p');
  title.className = 'emote-key-title';
  title.textContent = 'Faces';
  const list = document.createElement('ul');
  for (const [kind, label] of KEY) {
    const item = document.createElement('li');
    const img = document.createElement('img');
    img.src = emoteImage(kind);
    img.alt = '';
    item.append(img, label);
    list.append(item);
  }
  panel.append(title, list);

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'emote-key-tab';
  tab.setAttribute('aria-controls', panel.id);

  function setOpen(open) {
    root.classList.toggle('open', open);
    tab.textContent = open ? '‹' : '›';
    tab.setAttribute('aria-expanded', String(open));
    tab.title = open ? 'Hide the face key' : 'Show the face key';
    panel.inert = !open;
    localStorage.setItem(STORE, open ? '1' : '0');
  }
  tab.addEventListener('click', () => setOpen(!root.classList.contains('open')));
  setOpen(localStorage.getItem(STORE) !== '0');

  root.append(panel, tab);
  host.append(root);
}
