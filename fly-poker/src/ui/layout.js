/** Room and table measurements, in meters. The camera starts behind Mani. */

export const ROOM = { halfW: 3.6, halfD: 4.7, height: 3.2 };

export const TABLE = {
  x: 0,
  z: 0.1,
  top: 0.8,
  feltRx: 1.32,
  feltRz: 0.88,
  apronRx: 1.52,
  apronRz: 1.04,
};

export const SEAT = { rx: 2.02, rz: 1.56 };

/** Seat order is the visual ring, not the engine's roster order. */
export const SEATS = [
  { id: 'vera', angle: (210 * Math.PI) / 180 },
  { id: 'buzz', angle: (-30 * Math.PI) / 180 },
  { id: 'nib', angle: (30 * Math.PI) / 180 },
  { id: 'callie', angle: (150 * Math.PI) / 180 },
  { id: 'mani', angle: (90 * Math.PI) / 180 },
];

export const DEALER_ANGLE = -Math.PI / 2;

export function oval(angle, rx, rz, origin = TABLE) {
  return {
    x: origin.x + Math.cos(angle) * rx,
    z: origin.z + Math.sin(angle) * rz,
  };
}

export function insideFelt(x, z, pad = 0) {
  const dx = (x - TABLE.x) / (TABLE.feltRx + pad);
  const dz = (z - TABLE.z) / (TABLE.feltRz + pad);
  return dx * dx + dz * dz < 1;
}
