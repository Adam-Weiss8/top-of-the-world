// Thanksgiving: the Monday before through the Monday after — 23–30 November in 2026.
//
// Halloween goes dark. This one deliberately goes the other way, to late-afternoon golden
// hour, so the two never read as the same theme wearing a different hat. Staying light also
// means the chrome needs almost no overrides — see :root[data-theme='thanksgiving'] in
// style.css, which is a third the size of the Halloween block.
//
// Artwork here is drawing only: journey.js keeps every wrapper, animation class and flight
// path, so the turkeys fly the jets' routes and the geese flap on the birds' keyframes.

const DARK = '#4a3321'; // the outline on everything, standing in for the usual navy ink
const BROWN = '#8a5a2b';
const BODY = '#6f4420';
const RUST = '#b4441f';
const AMBER = '#d9822b';
const GOLD = '#e0b03c';
const CREAM = '#f3e3c3';
const WATTLE = '#c8372d';
const LEAF_COLOURS = [RUST, AMBER, GOLD, '#c2552a', '#a8762c'];

/**
 * Thanksgiving is the fourth Thursday in November, so the date drifts between the 22nd and
 * the 28th. Anchoring the window to the holiday instead of hardcoding 23–30 keeps it
 * bracketing the right days every year; in 2026 it resolves to exactly 23–30.
 */
function thanksgivingDate(year) {
  const firstOfNovember = new Date(year, 10, 1).getDay(); // 0 = Sunday, 4 = Thursday
  return 1 + ((4 - firstOfNovember + 7) % 7) + 21;
}

// A wedge fan of feathers, used for both the flying turkey's tail and the parade balloon's.
// Angles are SVG degrees, so negative is up.
function fan(cx, cy, r, from, to, n, colours) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180;
    const at = (rad, mul) => [(cx + Math.cos(rad) * r * mul).toFixed(1), (cy + Math.sin(rad) * r * mul).toFixed(1)];
    const [tx, ty] = at(a, 1);
    const [lx, ly] = at(a - 0.1, 0.6);
    const [rx, ry] = at(a + 0.1, 0.6);
    return (
      `<path d="M${cx},${cy} L${lx},${ly} L${tx},${ty} L${rx},${ry} Z" fill="${colours[i % colours.length]}"` +
      ` stroke="${DARK}" stroke-width="0.9" stroke-linejoin="round"/>`
    );
  }).join('');
}

// One leaf, also used as a loose feather in the turkey's wake — at this size the silhouette
// is the same and the extra path data would not read.
const leaf = (x, y, rot, s, fill) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
     <path d="M0,0 C5,-9 13,-11 16,-8 C13,-2 6,3 0,0 Z" fill="${fill}" stroke="${DARK}" stroke-width="0.8" stroke-linejoin="round"/>
     <path d="M0.5,-0.5 L14.5,-7.5" stroke="${DARK}" stroke-width="0.7" stroke-linecap="round"/>
   </g>`;

// The turkey's head, beak, snood and wattle — shared by the flyer and the balloon so the two
// are recognisably the same bird at two very different scales.
const turkeyHead = (s) => `
  <g transform="scale(${s})">
    <circle cx="0" cy="0" r="4.6" fill="#cf6a4a" stroke="${DARK}" stroke-width="1.2"/>
    <polygon points="-4,-1 -10,0.6 -4,2.2" fill="${GOLD}" stroke="${DARK}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M-4,-1.4 q-4,1.5 -3,5.5" fill="none" stroke="${WATTLE}" stroke-width="2" stroke-linecap="round"/>
    <path d="M-1,3.4 q3,3 6,0.6" fill="${WATTLE}" stroke="${DARK}" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="-1.2" cy="-1.6" r="1" fill="${DARK}"/>
  </g>`;

// ---------- the flyer ----------
// A wild turkey where the airliner was. They really do fly, briefly and badly, which is the
// joke: this one is at cruising altitude. Drawn nose-left like the jet it replaces, with the
// tail fan filling the space the contrail used to start in, and a few loose feathers drifting
// back where the contrail ran.
//
// The moving parts are the one place this theme needs more than drawing. A jet reads fine as
// a rigid shape sliding across the sky; a bird does not, it just looks dead. journey.js still
// owns the flight path — these classes only move pieces within the bird, and their keyframes
// live in style.css beside the rest of the scene's animation.
const wakeFeather = (x, y, rot, s, fill, delay) =>
  `<g class="tg-feather" style="animation-delay:${delay}s">${leaf(x, y, rot, s, fill)}</g>`;

const TURKEY = `
  ${wakeFeather(104, -5, -24, 0.6, GOLD, -0.4)}
  ${wakeFeather(74, 3, 16, 0.7, AMBER, -1.5)}
  ${wakeFeather(46, -3, -12, 0.8, RUST, -2.6)}
  <g class="tg-bob">
    ${fan(10, 1, 25, -78, 40, 9, [RUST, AMBER, GOLD, BROWN, CREAM])}
    <ellipse cx="0" cy="0" rx="13.5" ry="10" fill="${BODY}" stroke="${DARK}" stroke-width="1.4"/>
    <path d="M-9,-5 q-6,-3 -7,-11" fill="none" stroke="${BODY}" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M-9,-5 q-6,-3 -7,-11" fill="none" stroke="${DARK}" stroke-width="7" stroke-linecap="round" opacity="0.18"/>
    <g class="tg-wing"><path d="M6,-4 q-10,-5 -17,2 q8,7 17,2 z" fill="${BROWN}" stroke="${DARK}" stroke-width="1.2" stroke-linejoin="round"/></g>
    <path d="M2,8 l-6,4 M6,7 l-3,5" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round"/>
    <g transform="translate(-16 -17)">${turkeyHead(1)}</g>
  </g>`;

// ---------- geese ----------
// A skein of geese in place of the gulls. Same two-stroke wing shape, so the existing flap
// keyframes still read; the extra stroke is the outstretched neck that makes it a goose.
const goose = (bx, by) =>
  `<path d="M${bx - 9},${by - 2.5} Q${bx - 4},${by - 7.5} ${bx},${by} Q${bx + 4},${by - 7.5} ${bx + 9},${by - 2.5}"
         fill="none" stroke="${DARK}" stroke-width="2.2" stroke-linecap="round"/>
   <path d="M${bx - 0.5},${by + 0.5} L${bx - 6},${by + 2}" stroke="${DARK}" stroke-width="1.9" stroke-linecap="round"/>`;

// ---------- the parade balloon ----------
// The UFO already hangs with a cone of light beneath it, which is exactly the shape of a
// giant inflatable on its handler tethers — so the saucer becomes the balloon at the end of
// the parade and the light cone becomes the ropes.
const BALLOON = `
  ${fan(6, -12, 48, -168, -12, 11, [RUST, AMBER, GOLD, BROWN, CREAM])}
  <ellipse cx="0" cy="-12" rx="27" ry="23" fill="${AMBER}" stroke="${DARK}" stroke-width="2.2"/>
  <ellipse cx="-9" cy="-20" rx="9" ry="6" fill="rgba(255,245,220,0.45)"/>
  <path d="M-17,-6 q17,10 34,-2" fill="none" stroke="rgba(90,50,20,0.3)" stroke-width="1.6"/>
  <g transform="translate(-21 -31)">${turkeyHead(1.9)}</g>
  <path d="M-19,4 L-48,58 M-8,10 L-19,60 M8,10 L21,60 M19,4 L50,58"
        stroke="rgba(90,55,25,0.42)" stroke-width="1.2" stroke-linecap="round"/>`;

// ---------- woodsmoke ----------
// Warm haze on the same curves as the aurora it replaces. Green and violet would have read as
// northern lights no matter how autumnal everything underneath it was.
const SMOKE = `
  <path d="M-600,0 C-400,-60 -200,40 0,-20 S400,-70 600,0 S900,-40 1000,-10 L1000,40
           C800,10 600,60 400,20 S0,70 -200,30 S-500,60 -600,40 Z" fill="rgba(217,131,43,0.20)"/>
  <path d="M-600,-30 C-350,-90 -150,10 100,-50 S500,-90 1000,-40 L1000,-10
           C700,-60 400,-10 150,-30 S-300,-20 -600,-5 Z" fill="rgba(180,68,31,0.14)"/>`;

// ---------- the treeline ----------
// Mixed, not a wall of orange: the kind picked from x so the same tree always comes out the
// same way, with a few evergreens and a bare one left standing among the turning ones.
function autumnTree(x, s = 1) {
  const kind = Math.abs(Math.round(x / 10)) % 5;
  const trunk = '<rect x="-2" y="-9" width="4" height="9" fill="#5c3d22"/>';
  const litter = `${leaf(-13, 1, -18, 0.55, RUST)}${leaf(9, 0, 22, 0.5, GOLD)}`;
  const canopy = (a, b) =>
    `<circle cx="0" cy="-26" r="12" fill="${a}"/><circle cx="-8" cy="-18" r="9.5" fill="${b}"/>` +
    `<circle cx="8" cy="-18" r="9.5" fill="${b}"/><circle cx="0" cy="-15" r="9" fill="${a}"/>`;
  const body =
    kind === 0 ? canopy(RUST, '#9c3a1b')
    : kind === 1 ? canopy(GOLD, '#c89430')
    : kind === 2 ? canopy(AMBER, '#b86a22')
    : kind === 3 ? '<polygon points="-11,-6 0,-32 11,-6" fill="#3f5e3c"/><polygon points="-8,-17 0,-39 8,-17" fill="#4a6e46"/>'
    : '<path d="M0,-8 V-30 M0,-20 L-8,-28 M0,-24 L7,-31 M0,-16 L-7,-22 M0,-13 L6,-19" fill="none" stroke="#5c3d22" stroke-width="2" stroke-linecap="round"/>';
  return `<g transform="translate(${x} 2) scale(${s})">${trunk}${body}${litter}</g>`;
}

// ---------- the moon ----------
// A harvest moon, but pale gold rather than Halloween's burnt orange — the two hang in the
// same spot five weeks apart and should not be the same picture.
const harvestMoon = ({ cx, cy, r }) => `
  <circle cx="${cx}" cy="${cy}" r="${r + 40}" fill="rgba(240,205,130,0.11)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#f0dba6" stroke="#4a3a22" stroke-width="3"/>
  <path d="M${cx + 40},${cy - r + 4} A${r} ${r} 0 0 1 ${cx + r - 4},${cy + 30}"
        fill="none" stroke="rgba(255,248,222,0.55)" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${cx - 50}" cy="${cy - 70}" r="22" fill="#dcc488"/>
  <circle cx="${cx + 40}" cy="${cy - 10}" r="30" fill="#dcc488"/>
  <circle cx="${cx - 20}" cy="${cy + 60}" r="16" fill="#dcc488"/>
  <circle cx="${cx + 90}" cy="${cy - 90}" r="10" fill="#dcc488"/>`;

// ---------- things on the ground ----------

// Uncarved, deliberately: a jack-o'-lantern face would pull this straight back to October.
const pumpkin = (x, y, s = 1, fill = AMBER) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="-7" rx="11" ry="8.5" fill="${fill}" stroke="${DARK}" stroke-width="1.4"/>
    <path d="M-5.5,-13.5 Q-7.5,-7 -5.5,-0.5 M5.5,-13.5 Q7.5,-7 5.5,-0.5 M0,-15 V0.5"
          fill="none" stroke="rgba(90,45,15,0.35)" stroke-width="1"/>
    <path d="M0,-15 q-0.5,-4 3.5,-5" fill="none" stroke="#5c7a33" stroke-width="2.2" stroke-linecap="round"/>
  </g>`;

const gourd = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="-6" rx="7.5" ry="6" fill="#f0e3bf" stroke="${DARK}" stroke-width="1.3"/>
    <ellipse cx="0.5" cy="-13" rx="4.2" ry="4.6" fill="#dccf9b" stroke="${DARK}" stroke-width="1.2"/>
    <path d="M0.5,-17 q0,-3 2.5,-4" fill="none" stroke="#5c7a33" stroke-width="2" stroke-linecap="round"/>
  </g>`;

const sheaf = (x, y, s = 1) => {
  const stalks = [-7, -3.5, 0, 3.5, 7];
  return `<g transform="translate(${x} ${y}) scale(${s})">
    ${stalks.map((d) => `<path d="M0,0 Q${(d * 0.6).toFixed(1)},-12 ${d},-21" fill="none" stroke="#b8923a" stroke-width="2" stroke-linecap="round"/>`).join('')}
    ${stalks.map((d) => `<ellipse cx="${d}" cy="-23" rx="2.1" ry="4.2" fill="${GOLD}" stroke="${DARK}" stroke-width="0.8"/>`).join('')}
    <path d="M-6,-9 H6" stroke="#8a5a2b" stroke-width="2.6" stroke-linecap="round"/>
  </g>`;
};

const cornucopia = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M9,-6 C7,-16 -1,-20 -8,-17 C-15,-14 -17,-5 -11,-1 C-14,-7 -10,-13 -4,-13 C1,-13 6,-11 9,-6 Z"
          fill="#a9742f" stroke="${DARK}" stroke-width="1.3" stroke-linejoin="round"/>
    <ellipse cx="13" cy="-9" rx="5.2" ry="6" fill="${AMBER}" stroke="${DARK}" stroke-width="1.1"/>
    <circle cx="19" cy="-2.5" r="3.4" fill="#9e2b25" stroke="${DARK}" stroke-width="1"/>
    <circle cx="11" cy="-1.5" r="3" fill="#6f8f3a" stroke="${DARK}" stroke-width="1"/>
    <circle cx="22" cy="-10.5" r="2.6" fill="${GOLD}" stroke="${DARK}" stroke-width="1"/>
  </g>`;

const acorn = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="-4.5" rx="4.4" ry="5" fill="#c08a4a" stroke="${DARK}" stroke-width="1"/>
    <path d="M-5.6,-8 a5.6,3.6 0 0 1 11.2,0 z" fill="#7a5327" stroke="${DARK}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M0,-11.5 v-2.6" stroke="#7a5327" stroke-width="1.5" stroke-linecap="round"/>
  </g>`;

const leafPile = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    ${leaf(-9, 0.5, -22, 0.85, RUST)}${leaf(-2, -1.5, 14, 0.95, AMBER)}
    ${leaf(5, 0.5, -6, 0.85, GOLD)}${leaf(-5, -6, 38, 0.75, '#c2552a')}
  </g>`;

/**
 * Everything strewn across the lower scene. `extras` is handed the trail geometry so the
 * harvest sits beside the path wherever the path happens to run, and the rest is scattered
 * from a fixed seed — a player reloading should find the same leaves in the same places.
 */
function extras({ trailPoint, trailLength }) {
  let seed = 20261126;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const beside = [pumpkin, sheaf, gourd, leafPile, cornucopia, pumpkin, acorn, sheaf];
  const harvest = [0.05, 0.18, 0.31, 0.44, 0.56, 0.68, 0.8, 0.92]
    .map((t, i) => {
      const p = trailPoint(trailLength * t);
      return beside[i](p.x + (i % 2 ? 18 : -18), p.y + 4, 0.8 + (i % 3) * 0.1);
    })
    .join('');

  // Pumpkin patches tucked into the two stands of trees either side of the mountain.
  const patches = [-500, -455, -410, 710, 760, 830]
    .map((x, i) => pumpkin(x, 3 + (i % 2) * 5, 0.75 + (i % 3) * 0.15, i % 3 === 1 ? '#e4a63a' : AMBER))
    .join('');

  // Fallen leaves right across the meadow, thinning out as the ground recedes.
  const fallen = Array.from({ length: 90 }, () => {
    const x = -760 + rand() * 1900;
    const y = 4 + rand() * 70;
    return leaf(x.toFixed(0), y.toFixed(0), (rand() * 360).toFixed(0), 0.45 + rand() * 0.4, LEAF_COLOURS[Math.floor(rand() * LEAF_COLOURS.length)]);
  }).join('');

  // And a few still coming down around the trail.
  const falling = Array.from({ length: 14 }, () => {
    const x = -120 + rand() * 640;
    const y = -40 - rand() * 560;
    return leaf(x.toFixed(0), y.toFixed(0), (rand() * 360).toFixed(0), 0.4 + rand() * 0.3, LEAF_COLOURS[Math.floor(rand() * LEAF_COLOURS.length)]);
  }).join('');

  return fallen + patches + harvest + falling;
}

export const thanksgiving = {
  name: 'thanksgiving',
  label: 'Thanksgiving',
  // 23–30 November in 2026. The +4 can run past the 30th in years when the holiday falls
  // late, which simply means the window ends with the month — November has no 31st.
  when: (d) => {
    if (d.getMonth() !== 10) return false;
    const t = thanksgivingDate(d.getFullYear());
    return d.getDate() >= t - 3 && d.getDate() <= t + 4;
  },
  themeColor: '#f7efe0',

  // Warm daylight. Land stays the lightest thing on the board, as it is normally, so country
  // shapes read exactly as well as they always do. The tier colours are untouched on purpose —
  // they are the share emoji.
  map: {
    ocean: '#9cb7c3',
    oceanLine: 'rgba(255,252,240,0.5)',
    land: '#f4e7ca',
    landLine: 'rgba(120,90,50,0.17)',
    hover: '#eac898',
    border: '#9a8463',
    coastGlow: '#fff6e2',
    grid: 'rgba(90,60,30,0.17)',
    ink: '#4a3321',
  },

  // Late afternoon: amber on the horizon, deepening blue overhead, and the usual black once
  // the rocket is out of the atmosphere.
  // The two stops are blended vertically, so they have to be chosen as a pair: a plain blue
  // over a plain amber meets in the middle as khaki mud. Pulling the upper stops toward
  // violet makes that midpoint a dusty mauve instead, which reads as sunset.
  sky: {
    top: [[0, '#9ab0cf'], [200, '#8d93c2'], [330, '#50609e'], [440, '#13234a'], [520, '#060a18'], [1000, '#04060d']],
    bottom: [[0, '#f9cd8c'], [200, '#f2b178'], [330, '#b3819c'], [440, '#2d4f84'], [520, '#0d1834'], [1000, '#070b16']],
  },

  art: {
    jet: TURKEY,
    concorde: TURKEY,
    mirrorConcorde: true, // that leg flies east, so turn the bird around
    bird: goose,
    ufo: BALLOON,
    aurora: SMOKE,
    tree: autumnTree,
    moon: harvestMoon,
    extras,
    cloud: '#fdf3e2',
    ground: {
      grass: '#bca36e',
      grassEdge: '#a68c58',
      rockFar: '#d6c9b2',
      rockMid: '#e0d4bd',
      rockNear: '#9c8a70',
      rockShade: '#83715a',
      snow: '#fffaf0',
      snowShade: '#ecdfca',
      trail: 'rgba(90,55,25,0.45)',
      trailDone: '#c75b2a',
    },
  },
};
