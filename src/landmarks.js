// How points turn into altitude, and the real-world landmarks passed on the way.
//
// Each 200-point stage covers a much bigger stretch than the one before (the first
// is linear, the rest geometric), so climbing a mountain and crossing to the Moon
// both feel like a fair 200 points' work.

import { MAX_TOTAL } from './daily.js';

// [points, kilometres] at each stage boundary.
const STAGES = [
  [0, 0],
  [200, 8.849], // a mountain summit
  [400, 50], // top of the stratosphere
  [600, 408], // the International Space Station
  [800, 35_786], // geostationary orbit
  [1000, 384_400], // the Moon
];

/** Altitude in km for a points total. */
export function kmFor(points) {
  const p = Math.max(0, Math.min(MAX_TOTAL, points));
  for (let i = 1; i < STAGES.length; i++) {
    const [p0, k0] = STAGES[i - 1];
    const [p1, k1] = STAGES[i];
    if (p > p1) continue;
    const t = (p - p0) / (p1 - p0);
    return i === 1 ? k1 * t : k0 * (k1 / k0) ** t;
  }
  return STAGES.at(-1)[1];
}

/** Inverse of kmFor: the points total that reaches `km`. */
export function pointsForKm(km) {
  for (let i = 1; i < STAGES.length; i++) {
    const [p0, k0] = STAGES[i - 1];
    const [p1, k1] = STAGES[i];
    if (km > k1) continue;
    const t = i === 1 ? km / k1 : Math.log(km / k0) / Math.log(k1 / k0);
    return p0 + (p1 - p0) * t;
  }
  return MAX_TOTAL;
}

export function formatAltitude(km) {
  if (km < 1) return `${Math.round(km * 1000).toLocaleString('en-US')} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

// Shown only once passed, so nobody knows space is on the table until they get there.
export const LANDMARKS = [
  { km: 3, name: 'Above the clouds', emoji: '☁️' },
  { km: 5.4, name: 'Base camp', emoji: '⛺' },
  { km: 8, name: 'The death zone', emoji: '💀' },
  { km: 8.849, name: 'The summit', emoji: '🏔️' },
  { km: 10.7, name: 'Cruising jets', emoji: '✈️' },
  { km: 18.3, name: 'Concorde’s cruising height', emoji: '🛩️' },
  { km: 41.4, name: 'Highest skydive ever', emoji: '🪂' },
  { km: 100, name: 'The Kármán line — space begins', emoji: '🚀' },
  { km: 408, name: 'International Space Station', emoji: '🧑‍🚀' },
  { km: 540, name: 'Hubble Space Telescope', emoji: '🔭' },
  { km: 20_200, name: 'GPS satellites', emoji: '📡' },
  { km: 35_786, name: 'Geostationary orbit', emoji: '🛰️' },
  { km: 384_400, name: 'The Moon', emoji: '🌕' },
].map((l) => ({ ...l, points: pointsForKm(l.km) }));

/** The start of every journey, before any landmark. */
export const START_EMOJI = '🥾';

/** Every landmark reached with `points`, lowest first. */
export const landmarksReached = (points) => LANDMARKS.filter((l) => l.points <= points + 1e-6);

/** The highest landmark reached with `points`, if any. */
export function landmarkReached(points) {
  return LANDMARKS.filter((l) => l.points <= points + 1e-6).at(-1) ?? null;
}

/** Who's travelling at a given points total. */
export function travellerFor(points) {
  if (points >= MAX_TOTAL) return 'astronaut';
  if (points >= 400) return 'rocket';
  if (points >= 200) return 'balloon';
  return 'hiker';
}
