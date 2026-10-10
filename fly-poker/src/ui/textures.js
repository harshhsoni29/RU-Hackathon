/** Canvas textures drawn at runtime. No external image files. */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

let THREE_NS = null;

export function bindThree(THREE) {
  THREE_NS = THREE;
}

function makeTexture(c, repeatX = 1, repeatY = 1) {
  const tex = new THREE_NS.CanvasTexture(c);
  tex.colorSpace = THREE_NS.SRGBColorSpace;
  tex.wrapS = THREE_NS.RepeatWrapping;
  tex.wrapT = THREE_NS.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function carpetTexture() {
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  g.fillStyle = '#6a2030';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#4a1522';
  g.lineWidth = 2;
  for (let i = -512; i < 512; i += 36) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 512, 512);
    g.stroke();
    g.beginPath();
    g.moveTo(i, 512);
    g.lineTo(i + 512, 0);
    g.stroke();
  }
  g.strokeStyle = 'rgba(212, 168, 92, 0.35)';
  g.lineWidth = 6;
  g.strokeRect(28, 28, 456, 456);
  g.strokeStyle = 'rgba(90, 20, 32, 0.8)';
  g.lineWidth = 18;
  g.strokeRect(8, 8, 496, 496);
  return makeTexture(c, 2, 2);
}

export function woodTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#5a3418';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 7) {
    const n = 18 + ((y * 17) % 28);
    g.fillStyle = `rgba(30, 16, 6, ${0.08 + (y % 3) * 0.04})`;
    g.fillRect(0, y, 256, 3 + (y % 4));
    g.fillStyle = `rgba(220, 160, 90, 0.05)`;
    g.fillRect(0, y + n % 5, 256, 1);
  }
  return makeTexture(c, 2, 2);
}

export function velvetTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#3c1424';
  g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = ((i * 13) % 17) - 8;
    img.data[i] += n;
    img.data[i + 1] += n * 0.4;
    img.data[i + 2] += n * 0.3;
  }
  g.putImageData(img, 0, 0);
  return makeTexture(c, 2, 2);
}

export function feltTexture() {
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 256, 40, 256, 256, 280);
  grd.addColorStop(0, '#1e8a45');
  grd.addColorStop(1, '#0c5a30');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1800; i++) {
    const x = (i * 47) % 512;
    const y = (i * 91) % 512;
    g.fillStyle = `rgba(0, 0, 0, ${0.03 + (i % 5) * 0.012})`;
    g.fillRect(x, y, 2, 2);
  }
  return makeTexture(c);
}

export function wingTexture() {
  const c = canvas(128, 256);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 256);
  g.beginPath();
  g.moveTo(64, 8);
  g.quadraticCurveTo(124, 70, 108, 210);
  g.quadraticCurveTo(64, 250, 20, 210);
  g.quadraticCurveTo(4, 70, 64, 8);
  g.fillStyle = 'rgba(255, 255, 255, 0.55)';
  g.fill();
  g.strokeStyle = 'rgba(40, 50, 60, 0.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(64, 16);
  g.lineTo(64, 230);
  g.moveTo(64, 70);
  g.quadraticCurveTo(90, 120, 96, 190);
  g.moveTo(64, 70);
  g.quadraticCurveTo(38, 120, 32, 190);
  g.stroke();
  return makeTexture(c);
}

const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };

<<<<<<< HEAD
=======
/** Pip spots, top to bottom. A 1 means that pip is drawn upside down. */
const PIPS = {
  A: [[128, 196, 0]],
  2: [[128, 156, 0], [128, 250, 1]],
  3: [[128, 148, 0], [128, 204, 0], [128, 260, 1]],
  4: [[90, 156, 0], [166, 156, 0], [90, 250, 1], [166, 250, 1]],
  5: [[90, 150, 0], [166, 150, 0], [128, 204, 0], [90, 258, 1], [166, 258, 1]],
  6: [[90, 146, 0], [166, 146, 0], [90, 204, 0], [166, 204, 0], [90, 262, 1], [166, 262, 1]],
  7: [[90, 142, 0], [166, 142, 0], [128, 174, 0], [90, 206, 0], [166, 206, 0], [90, 264, 1], [166, 264, 1]],
  8: [[90, 140, 0], [166, 140, 0], [128, 170, 0], [90, 200, 0], [166, 200, 0], [128, 232, 1], [90, 266, 1], [166, 266, 1]],
  9: [[90, 136, 0], [166, 136, 0], [90, 170, 0], [166, 170, 0], [128, 204, 0], [90, 236, 1], [166, 236, 1], [90, 270, 1], [166, 270, 1]],
  T: [[90, 132, 0], [166, 132, 0], [128, 156, 0], [90, 180, 0], [166, 180, 0], [90, 224, 1], [166, 224, 1], [128, 248, 1], [90, 272, 1], [166, 272, 1]],
};

function drawPip(g, glyph, x, y, size, flip) {
  g.save();
  g.translate(x, y);
  if (flip) g.rotate(Math.PI);
  g.font = `${size}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, 0, size * 0.06);
  g.restore();
}

function drawCourt(g, rank, glyph) {
  g.save();
  g.font = '700 132px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(rank, 128, 198);
  g.font = '54px Georgia, serif';
  g.fillText(glyph, 128, 132);
  g.fillText(glyph, 128, 268);
  g.restore();
}

>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
export function cardTexture(rank, suit) {
  const c = canvas(256, 360);
  const g = c.getContext('2d');
  roundRect(g, 8, 8, 240, 344, 22);
  g.fillStyle = '#f6f0e4';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#1c140e';
  g.stroke();
  const red = suit === 'h' || suit === 'd';
  const ink = red ? '#c4232a' : '#1a1714';
  const label = rank === 'T' ? '10' : rank;
  const glyph = SUIT_GLYPH[suit] || suit;
  g.fillStyle = ink;
  g.font = '700 54px Georgia, serif';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText(label, 24, 22);
  g.font = '48px Georgia, serif';
  g.fillText(glyph, 28, 78);
<<<<<<< HEAD
  g.font = '120px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, 128, 200);
  g.save();
=======
  if (rank === 'J' || rank === 'Q' || rank === 'K') {
    drawCourt(g, rank, glyph);
  } else {
    const spots = PIPS[rank] || PIPS.A;
    const size = rank === 'A' ? 108 : spots.length > 6 ? 34 : 42;
    for (const [x, y, flip] of spots) drawPip(g, glyph, x, y, size, flip);
  }
  g.save();
  g.fillStyle = ink;
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
  g.translate(220, 320);
  g.rotate(Math.PI);
  g.font = '700 54px Georgia, serif';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText(label, 0, 0);
  g.restore();
  return makeTexture(c);
}

export function cardBackTexture() {
  const c = canvas(256, 360);
  const g = c.getContext('2d');
  roundRect(g, 8, 8, 240, 344, 22);
  g.fillStyle = '#1a3d32';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#d4b06a';
  g.stroke();
  g.strokeStyle = 'rgba(212, 176, 106, 0.7)';
  g.lineWidth = 3;
  roundRect(g, 28, 28, 200, 304, 14);
  g.stroke();
  g.fillStyle = '#d4b06a';
  g.font = '700 42px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FLY', 128, 180);
  return makeTexture(c);
}

export function plaqueTexture(text, accent = '#e6c27a') {
  const c = canvas(512, 128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  roundRect(g, 4, 16, 504, 96, 16);
  g.fillStyle = 'rgba(24, 14, 10, 0.88)';
  g.fill();
  g.fillStyle = accent;
  g.fillRect(4, 16, 12, 96);
  g.fillStyle = '#f6efe4';
  g.font = '600 54px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 268, 66);
  return makeTexture(c);
}

export function neonTexture() {
  const c = canvas(1024, 256);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.font = '800 140px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ff3355';
  g.shadowBlur = 36;
  g.fillStyle = '#ffd5dc';
  g.fillText("HOLD'EM", 512, 128);
  g.shadowBlur = 12;
  g.fillStyle = '#fff6f7';
  g.fillText("HOLD'EM", 512, 128);
  return makeTexture(c);
}

export function artTexture(kind) {
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  if (kind === 'suits') {
    g.fillStyle = '#1b2420';
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#e8d7b0';
    g.font = '180px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('♠', 160, 180);
    g.fillStyle = '#d23a3a';
    g.fillText('♥', 352, 180);
    g.fillStyle = '#d23a3a';
    g.fillText('♦', 160, 360);
    g.fillStyle = '#e8d7b0';
    g.fillText('♣', 352, 360);
  } else {
    g.fillStyle = '#241810';
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#6a2030';
    g.beginPath();
    g.ellipse(256, 270, 150, 190, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e6c27a';
    g.fillRect(236, 70, 40, 70);
    g.beginPath();
    g.arc(220, 70, 22, 0, Math.PI * 2);
    g.arc(292, 70, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f4ead8';
    g.font = '700 42px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('HOUSE', 256, 430);
  }
  return makeTexture(c);
}

export function rulesTexture() {
  const c = canvas(512, 640);
  const g = c.getContext('2d');
  g.fillStyle = '#f3e6c8';
  g.fillRect(0, 0, 512, 640);
  g.fillStyle = '#2a160e';
  g.fillRect(0, 0, 512, 86);
  g.fillStyle = '#f3e6c8';
  g.font = '700 40px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('HOUSE RULES', 256, 44);
  g.fillStyle = '#2a160e';
  g.font = '32px Georgia, serif';
  const lines = ['No-limit hold \'em', 'Five flies only', 'Blinds 5 / 10', 'Spectator cards up', 'Dealer is a beetle'];
  lines.forEach((line, i) => g.fillText(line, 256, 170 + i * 78));
  return makeTexture(c);
}
