// The journey scene: one tall world from the ground to the Moon, with a camera that
// follows the traveller. Each 200-point stage is the same height on screen (the
// stretched scale lives in landmarks.js), so every stage gets equal drama.
//
//   0–200     hiker climbs the mountain trail
//   200       a balloon drops in at the summit; the hiker hops into the basket
//   200–400   balloon rises through the clouds and past the jets
//   400       a rocket pulls up alongside; the hiker leaps across
//   400–1000  rocket climbs through space and orbit
//   1000      rocket lands on the Moon; an astronaut hops out and plants a flag

import { MAX_TOTAL } from './daily.js';
import { LANDMARKS, formatAltitude } from './landmarks.js';

const NS = 'http://www.w3.org/2000/svg';
const K = 3; // world units per point
const Y = (p) => -p * K;
const VIEW_W = 400;
const MS_PER_POINT = 19;
const HANDOFF = 1.3; // stretch for the handoff animations

// Velocity ramps up over the first 35% of a leg, cruises, then eases off over the last 20%,
// so each climb starts gently instead of lurching.
const RAMP_IN = 0.35;
const RAMP_OUT = 0.2;
const cruise = 1 / (1 - RAMP_IN / 2 - RAMP_OUT / 2);
function ramp(t) {
  if (t < RAMP_IN) return (0.5 * cruise * t * t) / RAMP_IN;
  if (t <= 1 - RAMP_OUT) return 0.5 * cruise * RAMP_IN + cruise * (t - RAMP_IN);
  return 1 - (0.5 * cruise * (1 - t) ** 2) / RAMP_OUT;
}

const TRAIL = [
  [60, -10], [330, -70], [110, -150], [300, -230], [150, -310],
  [270, -390], [175, -470], [235, -540], [200, -600],
];
// Trail geometry is computed here rather than with SVG getPointAtLength(): the scene is
// built while hidden, and Safari throws when measuring shapes that aren't rendered.
const TRAIL_SEGMENTS = TRAIL.slice(1).map((b, i) => {
  const a = TRAIL[i];
  return { a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
});
const TRAIL_LENGTH = TRAIL_SEGMENTS.reduce((sum, s) => sum + s.length, 0);

/** Point `distance` units along the mountain trail. */
function trailPoint(distance) {
  let left = Math.max(0, distance);
  for (const { a, b, length } of TRAIL_SEGMENTS) {
    if (left <= length) {
      const t = left / length;
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
    }
    left -= length;
  }
  const [x, y] = TRAIL.at(-1);
  return { x, y };
}

const BALLOON_X = 236;
const ROCKET_X = 316;
const MOON = { cx: 60, cy: -2840, r: 160 }; // its top sits at Y(1000)
const moonSurface = (x) => MOON.cy - Math.sqrt(MOON.r ** 2 - (x - MOON.cx) ** 2);
const LANDING_X = 88;
const ASTRO_X = 122;
const FLAG_X = 150;

// ---------- sprites ----------

const PALETTE = {
  r: '#d63a2f', s: '#f1c7a5', y: '#f6c21b', b: '#2f6f9f', d: '#22313f', t: '#22313f',
  w: '#f4f6f2', g: '#e9b949', p: '#aab4ba', k: '#22313f',
};

/** Pixel sprite, anchored at its bottom centre. */
function pixels(rows, px, cls = '') {
  const w = rows[0].length;
  const rects = rows.flatMap((row, y) =>
    [...row].map((c, x) =>
      c === '.'
        ? ''
        : `<rect x="${((x - w / 2) * px).toFixed(2)}" y="${((y - rows.length) * px).toFixed(2)}" width="${px + 0.05}" height="${px + 0.05}" fill="${PALETTE[c]}"/>`
    )
  );
  return `<g class="${cls}" shape-rendering="crispEdges">${rects.join('')}</g>`;
}

const HIKER_A = ['.rrr...', '.sss...', 'ybbb...', 'ybbbt..', 'ybbb.t.', '.bbb..t', '.d.d...', 'd...d..'];
const HIKER_B = ['.rrr...', '.sss...', 'ybbb...', 'ybbbt..', 'ybbb.t.', '.bbb..t', '..dd...', '..dd...'];
const HEAD = ['.rrr.', '.sss.'];
const ASTRONAUT = [
  '.kwwwk.', 'kwgggwk', 'kwgggwk', '.kwwwk.', 'pwwwwwk', 'pwwrwwk', 'pwwwwwk', '.kwwwk.', '.kw.wk.', '.kk.kk.',
];

const BALLOON = `
  <clipPath id="envelope-clip"><path d="M0,-40 C-22,-50 -40,-70 -40,-94 C-40,-120 -21,-134 0,-134 C21,-134 40,-120 40,-94 C40,-70 22,-50 0,-40Z"/></clipPath>
  <g clip-path="url(#envelope-clip)">
    <rect x="-42" y="-136" width="84" height="98" fill="#d63a2f"/>
    <rect x="-24" y="-136" width="12" height="98" fill="#f6c21b"/>
    <rect x="12" y="-136" width="12" height="98" fill="#f6c21b"/>
    <rect x="-42" y="-136" width="84" height="16" fill="rgba(255,255,255,0.18)"/>
  </g>
  <path d="M0,-40 C-22,-50 -40,-70 -40,-94 C-40,-120 -21,-134 0,-134 C21,-134 40,-120 40,-94 C40,-70 22,-50 0,-40Z" fill="none" stroke="#22313f" stroke-width="2.5"/>
  <path d="M-9,-44 L-10,-16 M9,-44 L10,-16" stroke="#22313f" stroke-width="1.5"/>
  <g class="passenger" transform="translate(0 -14)">${pixels(HEAD, 3)}</g>
  <rect x="-12" y="-16" width="24" height="16" rx="2" fill="#b07d45" stroke="#22313f" stroke-width="2"/>
  <path d="M-12,-10 H12" stroke="#22313f" stroke-width="1"/>`;

const ROCKET = `
  <g class="flame">
    <path d="M-8,-8 Q0,46 8,-8 Z" fill="#f08a5d"/>
    <path d="M-4.5,-8 Q0,26 4.5,-8 Z" fill="#f6c21b"/>
  </g>
  <path d="M-13,-16 L-21,0 M13,-16 L21,0" stroke="#22313f" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M-13,-34 L-25,-8 L-25,-2 L-13,-14 Z M13,-34 L25,-8 L25,-2 L13,-14 Z" fill="#d63a2f" stroke="#22313f" stroke-width="2" stroke-linejoin="round"/>
  <rect x="-8" y="-16" width="16" height="8" fill="#7d8f95" stroke="#22313f" stroke-width="2"/>
  <path d="M-13,-14 L-13,-62 C-13,-76 -6,-86 0,-94 C6,-86 13,-76 13,-62 L13,-14 Z" fill="#f4f6f2" stroke="#22313f" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M-10.5,-72 C-8,-80 -4,-88 0,-94 C4,-88 8,-80 10.5,-72 Z" fill="#d63a2f" stroke="#22313f" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="0" cy="-50" r="8" fill="#9fd3ff" stroke="#22313f" stroke-width="2.5"/>
  <g class="passenger" transform="translate(0 -44.5)">${pixels(HEAD, 2.2)}</g>`;

const MOON_SVG = `
  <circle cx="${MOON.cx}" cy="${MOON.cy}" r="${MOON.r + 26}" fill="rgba(220,230,240,0.08)"/>
  <circle cx="${MOON.cx}" cy="${MOON.cy}" r="${MOON.r}" fill="#c9ced2" stroke="#22313f" stroke-width="3"/>
  <path d="M${MOON.cx + 40},${MOON.cy - MOON.r + 4} A${MOON.r} ${MOON.r} 0 0 1 ${MOON.cx + MOON.r - 4},${MOON.cy + 30}"
        fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${MOON.cx - 50}" cy="${MOON.cy - 70}" r="22" fill="#b3b9be"/>
  <circle cx="${MOON.cx + 40}" cy="${MOON.cy - 10}" r="30" fill="#b3b9be"/>
  <circle cx="${MOON.cx - 20}" cy="${MOON.cy + 60}" r="16" fill="#b3b9be"/>
  <circle cx="${MOON.cx + 90}" cy="${MOON.cy - 90}" r="10" fill="#b3b9be"/>`;

function cloud(x, y, s = 1, cls = '') {
  return `<g class="cloud ${cls}" transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="0" rx="46" ry="16" fill="#fff"/>
    <circle cx="-18" cy="-10" r="17" fill="#fff"/><circle cx="10" cy="-16" r="21" fill="#fff"/>
    <circle cx="32" cy="-6" r="13" fill="#fff"/></g>`;
}

// Small V-shaped birds that flap and drift across.
const birds = (x, y, n, s = 1) =>
  `<g class="flock" transform="translate(${x} ${y}) scale(${s})">` +
  Array.from({ length: n }, (_, i) => {
    const bx = i * 22 - (i % 2) * 6;
    const by = (i % 2) * 10 - i * 3;
    return `<path class="bird" style="animation-delay:${(i * 0.17).toFixed(2)}s" d="M${bx - 7},${by - 3} Q${bx - 3},${by - 6} ${bx},${by} Q${bx + 3},${by - 6} ${bx + 7},${by - 3}" fill="none" stroke="#22313f" stroke-width="2" stroke-linecap="round"/>`;
  }).join('') +
  '</g>';

const tree = (x, s = 1) =>
  `<g transform="translate(${x} 2) scale(${s})"><rect x="-2" y="-8" width="4" height="8" fill="#6b4f33"/>` +
  '<polygon points="-12,-6 0,-34 12,-6" fill="#3f6b4f"/><polygon points="-9,-18 0,-42 9,-18" fill="#4c7d5c"/></g>';

const CONCORDE = `<g class="concorde" transform="translate(0 ${Y(284)})">
  <path d="M0,0 H-150" stroke="rgba(255,255,255,0.75)" stroke-width="3" stroke-linecap="round"/>
  <path d="M26,0 L-4,-3 L-14,-12 L-12,-3 L-18,-2 L-18,2 L-12,3 L-14,12 L-4,3 Z" fill="#f4f6f2" stroke="#22313f" stroke-width="1.2" stroke-linejoin="round"/></g>`;

const SKYDIVER = `<g transform="translate(70 ${Y(378) + 30})"><g class="parachute">
  <path d="M-22,-30 Q0,-58 22,-30 Z" fill="#f08a5d" stroke="#22313f" stroke-width="1.5"/>
  <path d="M-11,-30 Q0,-44 0,-30 M11,-30 Q0,-44 0,-30" fill="#f6c21b" stroke="#22313f" stroke-width="1"/>
  <path d="M-22,-30 L-2,-8 M22,-30 L2,-8 M0,-30 L0,-8" stroke="#22313f" stroke-width="0.8"/>
  <rect x="-3" y="-9" width="6" height="9" fill="#2f6f9f"/><rect x="-2.5" y="-13" width="5" height="4" fill="#f1c7a5"/></g></g>`;

const AURORA = `<g class="aurora" transform="translate(0 ${Y(455)})">
  <path d="M-600,0 C-400,-60 -200,40 0,-20 S400,-70 600,0 S900,-40 1000,-10 L1000,40 C800,10 600,60 400,20 S0,70 -200,30 S-500,60 -600,40 Z" fill="rgba(110,231,183,0.22)"/>
  <path d="M-600,-30 C-350,-90 -150,10 100,-50 S500,-90 1000,-40 L1000,-10 C700,-60 400,-10 150,-30 S-300,-20 -600,-5 Z" fill="rgba(167,139,250,0.18)"/></g>`;

const UFO = `<g transform="translate(110 ${Y(840)})"><g class="ufo">
  <ellipse cx="0" cy="-12" rx="12" ry="11" fill="rgba(159,211,255,0.7)" stroke="#22313f" stroke-width="1.5"/>
  <ellipse cx="0" cy="0" rx="30" ry="8" fill="#aab4ba" stroke="#22313f" stroke-width="2"/>
  <circle cx="-16" cy="1" r="2.5" fill="#f6c21b"/><circle cx="0" cy="3" r="2.5" fill="#f6c21b"/><circle cx="16" cy="1" r="2.5" fill="#f6c21b"/>
  <path d="M-10,8 L-24,60 L24,60 L10,8 Z" fill="rgba(246,194,27,0.12)"/></g></g>`;

const satellite = (x, y, s = 1) => `<g class="drift" transform="translate(${x} ${y}) scale(${s})">
  <rect x="-34" y="-5" width="24" height="10" fill="#2f6f9f" stroke="#22313f" stroke-width="1.5"/>
  <rect x="10" y="-5" width="24" height="10" fill="#2f6f9f" stroke="#22313f" stroke-width="1.5"/>
  <path d="M-10,0 H10" stroke="#22313f" stroke-width="2"/>
  <rect x="-8" y="-8" width="16" height="16" rx="2" fill="#e9b949" stroke="#22313f" stroke-width="1.5"/></g>`;

const ISS = `<g class="drift" transform="translate(70 ${Y(600)})">
  <path d="M-60,0 H60" stroke="#22313f" stroke-width="3"/>
  ${[-56, -36, 24, 44].map((x) => `<rect x="${x}" y="-22" width="14" height="44" fill="#2f6f9f" stroke="#22313f" stroke-width="1.5"/>`).join('')}
  <rect x="-14" y="-7" width="28" height="14" rx="3" fill="#f4f6f2" stroke="#22313f" stroke-width="1.5"/></g>`;

const JET = `<g class="jet" transform="translate(0 ${Y(222)})">
  <path d="M0,0 H140" stroke="rgba(255,255,255,0.8)" stroke-width="3" stroke-linecap="round"/>
  <path d="M-16,0 L10,-3 L14,0 L10,3 Z M-2,-1 L-8,-9 L-4,-9 L4,-1 Z M-2,1 L-8,9 L-4,9 L4,1 Z M-14,-1 L-18,-6 L-15,-6 L-11,-1 Z"
        fill="#f4f6f2" stroke="#22313f" stroke-width="1"/></g>`;

// Deterministic sprinkle of stars, in screen space.
function starfield(count, h) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: count }, () => {
    const r = rand() < 0.15 ? 1.6 : 0.9;
    return `<circle cx="${(rand() * 1600 - 600).toFixed(1)}" cy="${(rand() * (h + 400) - 200).toFixed(1)}" r="${r}" fill="#fff" opacity="${(0.4 + rand() * 0.6).toFixed(2)}"/>`;
  }).join('');
}

// ---------- the scene ----------

/**
 * `mode: 'play'` fills its container and follows the traveller.
 * `mode: 'poster'` is a still of the mountain for the intro card.
 */
export function createJourney(container, { mode = 'play' } = {}) {
  const H = 700;
  const poster = mode === 'poster';
  container.classList.add('journey');
  container.innerHTML = `
  <svg class="journey-svg" viewBox="${poster ? '-440 -650 1280 690' : `0 0 ${VIEW_W} ${H}`}" preserveAspectRatio="${poster ? 'xMidYMax slice' : 'xMidYMid meet'}">
    <defs>
      <linearGradient id="streak" x1="0" y1="0" x2="1" y2="0.33">
        <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="earth-fill" cx="0.4" cy="0.35" r="0.75">
        <stop offset="0" stop-color="#5aa3d6"/><stop offset="0.7" stop-color="#2f6f9f"/><stop offset="1" stop-color="#1d4b73"/>
      </radialGradient>
    </defs>
    <g class="skybox" ${poster ? 'display="none"' : ''}>
      <g class="stars">${starfield(260, H)}
        <path class="shooting-star" d="M0,0 L-90,-30" stroke="url(#streak)" stroke-width="2.5" stroke-linecap="round" transform="translate(360 120)"/>
        <path class="shooting-star late" d="M0,0 L-70,-24" stroke="url(#streak)" stroke-width="2" stroke-linecap="round" transform="translate(120 330)"/>
      </g>
      <g class="earth" opacity="0">
        <circle class="earth-glow" fill="none" stroke="#9fd3ff" stroke-width="10" opacity="0.5"/>
        <circle class="earth-body" fill="url(#earth-fill)" stroke="#22313f" stroke-width="2"/>
      </g>
    </g>
    <g class="world">
      <polygon points="-900,0 -420,-330 -60,0" fill="#b7c7d1"/>
      <polygon points="380,0 700,-380 1100,0" fill="#b7c7d1"/>
      <polygon points="-1300,0 -900,-220 -600,0" fill="#c7d4dc"/>
      <polygon points="900,0 1250,-260 1600,0" fill="#c7d4dc"/>
      ${cloud(-380, -150, 1.4, 'slow')}${cloud(620, -120, 1.2)}${cloud(900, -230, 1.5, 'slow')}
      <polygon points="-260,0 200,-600 660,0" fill="#6f8290"/>
      <polygon points="200,-600 660,0 430,0 300,-260 240,-470" fill="#5d707e"/>
      <path d="M-180,-60 Q200,-90 580,-60 M-100,-150 Q200,-180 500,-150 M-20,-250 Q200,-275 420,-250 M70,-360 Q200,-380 330,-360"
            fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="3"/>
      <polygon points="200,-600 148,-534 172,-526 188,-546 206,-520 228,-542 252,-530" fill="#fff"/>
      <polygon points="200,-600 252,-530 228,-542 222,-556" fill="#e3edf3"/>
      <rect x="-2000" y="0" width="4400" height="900" fill="#93ab8a"/>
      <rect x="-2000" y="0" width="4400" height="10" fill="#7f9877"/>
      ${[-520, -470, -430, -330, -300, 690, 730, 780, 860, 905].map((x, i) => tree(x, 0.8 + (i % 3) * 0.2)).join('')}
      <polyline class="trail" points="${TRAIL.map((p) => p.join(',')).join(' ')}" fill="none"
                stroke="rgba(255,255,255,0.75)" stroke-width="3" stroke-dasharray="6 6" stroke-linecap="round"/>
      <polyline class="trail-done" points="${TRAIL.map((p) => p.join(',')).join(' ')}" fill="none"
                stroke="#f6c21b" stroke-width="4" stroke-linecap="round"/>
      <g transform="translate(200 -600)">
        <line x1="0" y1="0" x2="0" y2="-26" stroke="#22313f" stroke-width="2.5"/>
        <polygon class="wave" points="0,-26 18,-20 0,-14" fill="#d63a2f"/>
      </g>
      ${cloud(-40, -200, 1)}${cloud(380, -250, 1.3, 'slow')}${cloud(40, -660, 1.6, 'slow')}${cloud(420, -720, 1.2)}
      ${cloud(-200, -790, 1.4)}${cloud(260, -900, 1.1, 'slow')}
      ${birds(-120, -170, 3)}${birds(420, -420, 4, 0.9)}${birds(-60, -520, 2, 0.8)}
      ${JET}${CONCORDE}${SKYDIVER}${AURORA}${UFO}
      <path class="balloon-path" fill="none"/>
      <path class="smoke" fill="none"/>
      <g class="star-trail"></g>
      ${ISS}${satellite(330, Y(613) - 20, 0.8)}${satellite(90, Y(774), 0.9)}${satellite(340, Y(800), 1.1)}
      ${MOON_SVG}
      <g class="landmarks"></g>
      <g class="moon-flag" transform="translate(${FLAG_X} ${moonSurface(FLAG_X)})">
        <g class="flag-rise">
          <line x1="0" y1="0" x2="0" y2="-34" stroke="#22313f" stroke-width="2.5"/>
          <rect x="0" y="-34" width="24" height="15" fill="#d63a2f" stroke="#22313f" stroke-width="1.5"/>
          <polygon points="12,-31 7,-22 17,-22" fill="#fff"/>
        </g>
      </g>
      <g class="balloon">${BALLOON}</g>
      <g class="rocket">${ROCKET}</g>
      <g class="hiker">${pixels(HIKER_A, 3, 'frame frame-a')}${pixels(HIKER_B, 3, 'frame frame-b')}</g>
      <g class="astronaut">${pixels(ASTRONAUT, 3)}</g>
    </g>
  </svg>`;

  const svg = container.querySelector('svg');
  const $ = (sel) => svg.querySelector(sel);
  const world = $('.world');
  const trailDone = $('.trail-done');
  const hiker = $('.hiker');
  const balloon = $('.balloon');
  const rocket = $('.rocket');
  const astronaut = $('.astronaut');
  const moonFlag = $('.moon-flag');
  const stars = $('.stars');
  const earth = $('.earth');
  trailDone.style.strokeDasharray = `${TRAIL_LENGTH} ${TRAIL_LENGTH}`;

  // The Moon gets the HUD's landing message rather than a label on the surface.
  const landmarkEls = LANDMARKS.filter((l) => l.points < MAX_TOTAL).map((l) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'landmark');
    g.setAttribute('transform', `translate(0 ${Y(l.points)})`);
    const label = `${l.name} · ${formatAltitude(l.km)}`;
    g.innerHTML =
      `<line x1="-600" x2="1000" y1="0" y2="0" class="landmark-line"/>` +
      `<g class="landmark-tag"><rect x="6" y="-11" height="22" rx="3" width="${label.length * 6.4 + 16}"/>` +
      `<text x="14" y="4">${label}</text></g>`;
    $('.landmarks').append(g);
    return { ...l, g };
  });

  // ---------- state ----------

  const show = (el, on) => el.style.setProperty('display', on ? '' : 'none');
  const put = (el, x, y, extra = '') => el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) ${extra}`);
  let camY = 0;
  let followY = 0; // camera position that frames the traveller
  let lookDown = 0; // how far the player has scrolled below the traveller

  function camera(y) {
    if (poster) return;
    // Keep the traveller ~62% down the screen, but never lift the ground above 82%.
    followY = Math.max(H * 0.82, H * 0.62 - y);
    applyCamera();
  }

  function applyCamera() {
    // Players can look back down to the ground, never up past where they've reached.
    lookDown = Math.max(0, Math.min(lookDown, followY - H * 0.82));
    camY = followY - lookDown;
    world.setAttribute('transform', `translate(0 ${camY.toFixed(1)})`);
  }

  /** Scroll the view down (positive) or back up toward the traveller (negative), in world units. */
  function look(dy) {
    if (poster) return;
    running?.finish();
    lookDown += dy;
    applyCamera();
    sky(Math.max(0, (camY - H * 0.62) / K)); // the sky matches the altitude in view
  }

  function sky(p) {
    container.style.setProperty('--sky-top', mix(SKY_TOP, p));
    container.style.setProperty('--sky-bottom', mix(SKY_BOTTOM, p));
    stars.setAttribute('opacity', clamp((p - 380) / 120).toFixed(2));
    const t = clamp((p - 440) / 560);
    earth.setAttribute('opacity', clamp((p - 440) / 50).toFixed(2));
    const r = 2600 * (34 / 2600) ** t;
    const top = H - 70 + (120 - (H - 70)) * t ** 2.5; // stays low as a horizon, then lifts into the sky
    const cx = 200 - 120 * t;
    for (const c of earth.children) {
      c.setAttribute('cx', cx.toFixed(1));
      c.setAttribute('cy', (top + r).toFixed(1));
      c.setAttribute('r', r.toFixed(1));
    }
  }

  function landmarks(p) {
    for (const l of landmarkEls) l.g.classList.toggle('passed', l.points <= p + 1e-6);
  }

  function hikerOnTrail(p) {
    const at = clamp(p / 200) * TRAIL_LENGTH;
    const pt = trailPoint(at);
    const ahead = trailPoint(Math.min(TRAIL_LENGTH, at + 1));
    put(hiker, pt.x, pt.y, `scale(${ahead.x < pt.x ? -1 : 1} 1)`);
    trailDone.style.strokeDashoffset = String(TRAIL_LENGTH - at);
    return pt.y;
  }

  const balloonX = (p) => BALLOON_X + 8 * Math.sin((p - 200) / 28);

  // The route continues past the summit: a dotted line behind the balloon, a zig-zag
  // smoke trail behind the rocket through the atmosphere, then sparkling stars in space.
  const balloonPath = $('.balloon-path');
  const smoke = $('.smoke');
  const starTrail = $('.star-trail');
  const SPACE = 466; // the Kármán line
  let starsDrawn = -1;
  function skyTrail(p) {
    const pts = [];
    if (p > 200) {
      pts.push(TRAIL.at(-1));
      for (let q = 200; q <= Math.min(p, 400); q += 4) pts.push([balloonX(q), Y(q) - 2]);
      if (p < 400) pts.push([balloonX(p), Y(p) - 2]);
    }
    balloonPath.setAttribute('d', pts.length ? 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L') : '');

    const zig = [];
    if (p > 400) {
      const end = Math.min(p, SPACE);
      for (let q = 400, i = 0; q <= end; q += 3, i++) zig.push([ROCKET_X + (i % 2 ? 8 : -8), Y(q) + 2]);
      if (p <= SPACE) zig.push([ROCKET_X, Y(p) + 4]);
    }
    smoke.setAttribute('d', zig.length ? 'M' + zig.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L') : '');

    const count = p > SPACE ? Math.floor((Math.min(p, 985) - SPACE) / 9) : 0;
    if (count !== starsDrawn) {
      starsDrawn = count;
      starTrail.innerHTML = Array.from({ length: count }, (_, i) => {
        const q = SPACE + 9 * (i + 1);
        const x = ROCKET_X + (i % 2 ? 11 : -11);
        const r = 3 + (i % 3);
        // Position on a wrapper so the twinkle's rotation spins each star in place.
        return `<g transform="translate(${x} ${Y(q) + 20})"><path class="trail-star" style="animation-delay:${((i % 5) * 0.3).toFixed(1)}s"
          d="M0,${-r * 2} L${r * 0.5},${-r * 0.5} L${r * 2},0 L${r * 0.5},${r * 0.5} L0,${r * 2} L${-r * 0.5},${r * 0.5} L${-r * 2},0 L${-r * 0.5},${-r * 0.5} Z"/></g>`;
      }).join('');
    }
  }

  /** Static pose for a points total (no handoff animations). */
  function place(p) {
    lookDown = 0;
    const who = p >= MAX_TOTAL ? 'astronaut' : p >= 400 ? 'rocket' : p >= 200 ? 'balloon' : 'hiker';
    show(hiker, who === 'hiker');
    show(balloon, who === 'balloon');
    show(rocket, who === 'rocket' || who === 'astronaut');
    show(astronaut, who === 'astronaut');
    moonFlag.classList.toggle('planted', who === 'astronaut');
    balloon.querySelector('.passenger').style.display = '';
    rocket.querySelector('.passenger').style.display = who === 'astronaut' ? 'none' : '';
    rocket.classList.toggle('burning', false);
    svg.classList.remove('walking');

    let y;
    if (who === 'hiker') y = hikerOnTrail(p);
    else {
      trailDone.style.strokeDashoffset = '0';
      if (who === 'balloon') put(balloon, balloonX(p), (y = Y(p)));
      if (who === 'rocket') put(rocket, ROCKET_X, (y = Y(p)));
      if (who === 'astronaut') {
        put(rocket, LANDING_X, moonSurface(LANDING_X));
        put(astronaut, ASTRO_X, moonSurface(ASTRO_X));
        y = Y(MAX_TOTAL);
      }
    }
    camera(y);
    sky(p);
    landmarks(p);
    skyTrail(p);
  }

  // ---------- animation ----------

  /** Steps: [{ ms, frame(t) }]; frame(1) must leave the scene in the step's end state. */
  function stepsBetween(from, to) {
    const steps = [];
    const climb = (a, b, frame) => steps.push({ ms: Math.max(700, (b - a) * MS_PER_POINT), frame });
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const lerp = (a, b, t) => a + (b - a) * t;
    const hop = (el, [x0, y0], [x1, y1], t, height = 40) =>
      put(el, lerp(x0, x1, t), lerp(y0, y1, t) - Math.sin(Math.PI * t) * height);

    let p = from;
    // Hiker on the mountain.
    if (p < 200) {
      const a = p;
      const b = Math.min(to, 200);
      climb(a, b, (t) => {
        svg.classList.toggle('walking', t < 1);
        const q = lerp(a, b, ramp(t));
        camera(hikerOnTrail(q));
        sky(q);
        landmarks(q);
        steps.progress?.(q);
      });
      p = b;
    }
    // Balloon arrives at the summit and the hiker hops in.
    if (from < 200 && to >= 200) {
      steps.push({
        ms: 900 * HANDOFF,
        frame: (t) => {
          show(balloon, true);
          balloon.querySelector('.passenger').style.display = 'none';
          put(balloon, BALLOON_X, lerp(Y(200) - 280, Y(200), ease(t)));
          camera(Y(200));
        },
      });
      steps.push({
        ms: 550 * HANDOFF,
        frame: (t) => {
          hop(hiker, TRAIL.at(-1), [BALLOON_X, Y(200) - 14], t, 34);
          if (t >= 1) {
            show(hiker, false);
            balloon.querySelector('.passenger').style.display = '';
          }
        },
      });
    }
    // Balloon rises.
    if (p >= 200 && p < 400 && to > p) {
      const a = p;
      const b = Math.min(to, 400);
      climb(a, b, (t) => {
        const q = lerp(a, b, ramp(t));
        put(balloon, balloonX(q), Y(q));
        skyTrail(q);
        camera(Y(q));
        sky(q);
        landmarks(q);
        steps.progress?.(q);
      });
      p = b;
    }
    // Rocket pulls alongside; the passenger leaps across; the balloon drifts off.
    if (from < 400 && to >= 400) {
      const bx = balloonX(400);
      steps.push({
        ms: 900 * HANDOFF,
        frame: (t) => {
          show(rocket, true);
          rocket.querySelector('.passenger').style.display = 'none';
          rocket.classList.toggle('burning', t < 1);
          put(rocket, lerp(ROCKET_X + 280, ROCKET_X, ease(t)), Y(400));
        },
      });
      steps.push({
        ms: 600 * HANDOFF,
        frame: (t) => {
          balloon.querySelector('.passenger').style.display = 'none';
          show(hiker, t < 1);
          hop(hiker, [bx, Y(400) - 16], [ROCKET_X, Y(400) - 40], t, 46);
          if (t >= 1) rocket.querySelector('.passenger').style.display = '';
        },
      });
      steps.push({
        ms: 700 * HANDOFF,
        frame: (t) => {
          put(balloon, lerp(bx, bx - 220, ease(t)), lerp(Y(400), Y(400) + 120, ease(t)));
          balloon.style.opacity = String(1 - t);
          rocket.classList.toggle('burning', true);
          if (t >= 1) {
            show(balloon, false);
            balloon.style.opacity = '';
          }
        },
      });
    }
    // Rocket climbs (stopping a little short of the Moon if it's going to land).
    if (p >= 400 && p < MAX_TOTAL && to > p) {
      const a = p;
      const b = to >= MAX_TOTAL ? Math.max(a, 985) : to;
      climb(a, b, (t) => {
        rocket.classList.toggle('burning', t < 1 || to >= MAX_TOTAL);
        const q = lerp(a, b, ramp(t));
        put(rocket, ROCKET_X, Y(q));
        skyTrail(q);
        camera(Y(q));
        sky(q);
        landmarks(q);
        steps.progress?.(q);
      });
      p = b;
    }
    // Moon landing: arc over the top, touch down, hop out, plant the flag.
    if (to >= MAX_TOTAL && from < MAX_TOTAL) {
      const start = [ROCKET_X, Y(Math.max(p, 985))];
      const c1 = [ROCKET_X + 10, Y(1000) - 150];
      const c2 = [LANDING_X + 40, Y(1000) - 170];
      const end = [LANDING_X, moonSurface(LANDING_X)];
      steps.push({
        ms: 2200 * HANDOFF,
        frame: (t) => {
          const e = ease(t);
          const bez = (i) =>
            (1 - e) ** 3 * start[i] + 3 * (1 - e) ** 2 * e * c1[i] + 3 * (1 - e) * e ** 2 * c2[i] + e ** 3 * end[i];
          put(rocket, bez(0), bez(1), `rotate(${(-18 * Math.sin(Math.PI * e)).toFixed(1)})`);
          rocket.classList.toggle('burning', t < 1);
          camera(lerp(Y(985), Y(1000), e));
          sky(lerp(985, 1000, e));
          landmarks(lerp(985, 1000, e));
          steps.progress?.(lerp(985, 1000, e));
        },
      });
      steps.push({
        ms: 650 * HANDOFF,
        frame: (t) => {
          rocket.querySelector('.passenger').style.display = 'none';
          show(astronaut, true);
          hop(astronaut, [LANDING_X, moonSurface(LANDING_X) - 40], [ASTRO_X, moonSurface(ASTRO_X)], t, 30);
        },
      });
      steps.push({ ms: 500 * HANDOFF, frame: (t) => t >= 1 && moonFlag.classList.add('planted') });
    }
    return steps;
  }

  let running = null;

  // Scrolling: mouse wheel or dragging. Starting to scroll mid-animation skips to the end.
  if (!poster) {
    const unitsPerPx = () => 1 / (svg.getScreenCTM()?.a || 1);
    container.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        look(e.deltaY * unitsPerPx());
      },
      { passive: false }
    );
    let drag = null;
    container.addEventListener('pointerdown', (e) => {
      drag = { y: e.clientY, moved: 0 };
    });
    container.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = drag.y - e.clientY; // finger moving up looks further down, like scrolling a page
      drag.y = e.clientY;
      drag.moved += Math.abs(dy);
      if (drag.moved > 6) {
        container.setPointerCapture?.(e.pointerId);
        look(dy * unitsPerPx());
      }
    });
    const endDrag = () => {
      if (drag?.moved > 6) container.dataset.dragged = 'true';
      drag = null;
    };
    container.addEventListener('pointerup', endDrag);
    container.addEventListener('pointercancel', endDrag);
    // A drag shouldn't also count as a tap-to-skip on the screen behind.
    container.addEventListener(
      'click',
      (e) => {
        if (container.dataset.dragged) {
          delete container.dataset.dragged;
          e.stopPropagation();
        }
      },
      true
    );
  }

  return {
    /** Jump straight to the resting pose for `points`. */
    jumpTo(points) {
      running?.finish();
      place(points);
    },

    /**
     * Animate from `from` to `to` points. `onProgress(points)` fires as the traveller
     * moves. Resolves when the scene settles (immediately after skip()).
     */
    play(from, to, { onProgress } = {}) {
      running?.finish();
      place(from);
      const steps = stepsBetween(from, to);
      steps.progress = onProgress;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        place(to);
        onProgress?.(to);
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        let i = 0;
        let stepStart = performance.now();
        let raf = 0;
        const finish = () => {
          cancelAnimationFrame(raf);
          running = null;
          place(to);
          onProgress?.(to);
          resolve();
        };
        const tick = (now) => {
          while (i < steps.length) {
            const t = Math.max(0, Math.min(1, (now - stepStart) / steps[i].ms));
            steps[i].frame(t);
            if (t < 1) break;
            stepStart += steps[i].ms;
            i++;
          }
          if (i >= steps.length) return finish();
          raf = requestAnimationFrame(tick);
        };
        running = { finish };
        raf = requestAnimationFrame(tick);
      });
    },

    /** Jump to the end of whatever is playing. */
    skip() {
      running?.finish();
    },
  };
}

// ---------- sky colours by points ----------

const SKY_TOP = [
  [0, '#8fc1df'], [200, '#78acd4'], [330, '#3f74ad'], [440, '#13234a'], [520, '#060a18'], [1000, '#04060d'],
];
const SKY_BOTTOM = [
  [0, '#f6d6c6'], [200, '#d6eaf4'], [330, '#8fbfe0'], [440, '#2d5a92'], [520, '#0d1834'], [1000, '#070b16'],
];

const clamp = (t) => Math.max(0, Math.min(1, t));

function mix(stops, p) {
  const next = stops.findIndex(([q]) => q >= p);
  const i = next === -1 ? stops.length - 1 : Math.max(1, next);
  const [p0, c0] = stops[i - 1];
  const [p1, c1] = stops[i];
  const t = clamp((p - p0) / (p1 - p0));
  const rgb = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
  const [a, b] = [rgb(c0), rgb(c1)];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})`;
}
