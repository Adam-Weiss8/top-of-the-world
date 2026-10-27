// Halloween: 29–31 October.
//
// Artwork here is drawing only — journey.js keeps every wrapper, animation class and flight
// path, so the witches fly the jets' routes and the bats flap on the birds' keyframes.
// The chrome's colours live in style.css under :root[data-theme='halloween'].

// A witch on a broomstick, drawn nose-left like the jet she replaces, with a wisp of a trail
// behind her instead of a contrail. journey.js mirrors her for the eastbound flight.
const WITCH = `
  <path d="M6,-1 H120" stroke="rgba(190,150,230,0.3)" stroke-width="3" stroke-linecap="round"/>
  <path d="M-24,2 L16,-2" stroke="#6b4f33" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M16,-2 L28,-8 M16,-2 L29,-2 M16,-2 L28,5" stroke="#c98b3a" stroke-width="2" stroke-linecap="round"/>
  <path d="M-2,0 Q10,-2 20,-9" fill="none" stroke="#7a2bbf" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M-11,-15 L-17,1 L-2,1 Z" fill="#2b1b3d" stroke="#120a1c" stroke-width="1.3" stroke-linejoin="round"/>
  <circle cx="-12" cy="-18" r="3.6" fill="#a7d98a"/>
  <path d="M-20,-20 L-9,-34 L-3,-20 Z" fill="#2b1b3d" stroke="#120a1c" stroke-width="1.3" stroke-linejoin="round"/>
  <path d="M-21,-20 H-2" stroke="#120a1c" stroke-width="2.2" stroke-linecap="round"/>`;

// A bat in place of each bird. Same two-stroke wing shape so the flap keyframes still read.
const bat = (bx, by) =>
  `<path d="M${bx - 9},${by - 4} q3,-4 5.5,0 q2,-3.5 3.5,0 q1.5,-3.5 3.5,0 q2.5,-4 5.5,0` +
  ` q-2.5,4 -5.5,2.5 q-2,3 -3.5,0 q-1.5,3 -3.5,0 q-3,1.5 -5.5,-2.5 z" fill="#2b1b3d"/>`;

const GHOST = `
  <path d="M0,-28 C13,-28 17,-17 17,-7 L17,11 L11.5,4 L6,11 L0,4 L-6,11 L-11.5,4 L-17,11 L-17,-7
           C-17,-17 -13,-28 0,-28 Z" fill="rgba(238,240,246,0.88)" stroke="#2b1b3d" stroke-width="1.6" stroke-linejoin="round"/>
  <ellipse cx="-5.5" cy="-13" rx="2.4" ry="3" fill="#2b1b3d"/>
  <ellipse cx="5.5" cy="-13" rx="2.4" ry="3" fill="#2b1b3d"/>
  <ellipse cx="0" cy="-4" rx="3.2" ry="4.2" fill="#2b1b3d"/>`;

// Sickly green fog where the aurora was.
const FOG = `
  <path d="M-600,0 C-400,-60 -200,40 0,-20 S400,-70 600,0 S900,-40 1000,-10 L1000,40
           C800,10 600,60 400,20 S0,70 -200,30 S-500,60 -600,40 Z" fill="rgba(122,196,92,0.26)"/>
  <path d="M-600,-30 C-350,-90 -150,10 100,-50 S500,-90 1000,-40 L1000,-10
           C700,-60 400,-10 150,-30 S-300,-20 -600,-5 Z" fill="rgba(86,150,70,0.2)"/>`;

const deadTree = (x, s = 1) =>
  `<g transform="translate(${x} 2) scale(${s})">
    <path d="M0,0 V-27" stroke="#3b2c22" stroke-width="3" stroke-linecap="round"/>
    <path d="M0,-10 L-8,-16 M0,-15 L8,-22 M0,-20 L-7,-28 M0,-23 L6,-31 M-8,-16 L-11,-22 M8,-22 L11,-27"
          stroke="#3b2c22" stroke-width="2" stroke-linecap="round" fill="none"/>
  </g>`;

const harvestMoon = ({ cx, cy, r }) => `
  <circle cx="${cx}" cy="${cy}" r="${r + 34}" fill="rgba(240,150,60,0.13)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#e8822a" stroke="#2b1b3d" stroke-width="3"/>
  <path d="M${cx + 40},${cy - r + 4} A${r} ${r} 0 0 1 ${cx + r - 4},${cy + 30}"
        fill="none" stroke="rgba(255,222,170,0.45)" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${cx - 50}" cy="${cy - 70}" r="22" fill="#cf6d21"/>
  <circle cx="${cx + 40}" cy="${cy - 10}" r="30" fill="#cf6d21"/>
  <circle cx="${cx - 20}" cy="${cy + 60}" r="16" fill="#cf6d21"/>
  <circle cx="${cx + 90}" cy="${cy - 90}" r="10" fill="#cf6d21"/>`;

const pumpkin = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="-7" rx="11" ry="9" fill="#e8822a" stroke="#2b1b3d" stroke-width="1.6"/>
    <path d="M-4,-15 V-13 M4,-15 V-13" stroke="#2b1b3d" stroke-width="1.4"/>
    <path d="M0,-16 V-12" stroke="#4c7d2f" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M-5,-10 l2.5,3 l2.5,-3 Z M5,-10 l-2.5,3 l-2.5,-3 Z" fill="#2b1b3d"/>
    <path d="M-5,-3 q5,3 10,0 q-2,-2 -5,-1 q-3,-1 -5,1 Z" fill="#2b1b3d"/>
  </g>`;

// Jack-o'-lanterns beside the trail, placed from the trail geometry journey.js passes in so
// they stay put if the path is ever redrawn.
const extras = ({ trailPoint, trailLength }) =>
  [0.08, 0.3, 0.52, 0.74, 0.93]
    .map((t, i) => {
      const p = trailPoint(trailLength * t);
      return pumpkin(p.x + (i % 2 ? 17 : -17), p.y + 4, 0.85 + (i % 3) * 0.12);
    })
    .join('');

export const halloween = {
  name: 'halloween',
  label: 'Halloween',
  when: (d) => d.getMonth() === 9 && d.getDate() >= 29 && d.getDate() <= 31,
  themeColor: '#17101f',

  // Dusk, but the land stays lighter than the sea so country shapes read exactly as well as
  // they do normally. The tier colours that reveal the answers are untouched on purpose —
  // they are the share emoji.
  map: {
    ocean: '#241a33',
    oceanLine: 'rgba(214,184,255,0.13)',
    land: '#d9cdb8',
    landLine: 'rgba(90,60,110,0.17)',
    hover: '#efc08a',
    border: '#7a6a8c',
    coastGlow: '#e8a44f',
    grid: 'rgba(236,220,255,0.16)',
    ink: '#2a1f38',
  },

  // A Halloween sunset on the horizon going to black overhead.
  sky: {
    top: [[0, '#2a1b3d'], [200, '#1f1430'], [330, '#160e26'], [440, '#0d0817'], [520, '#070410'], [1000, '#04020a']],
    bottom: [[0, '#d9622a'], [200, '#8a3a52'], [330, '#4a2252'], [440, '#1d1030'], [520, '#0b0618'], [1000, '#06030e']],
  },

  art: {
    jet: WITCH,
    concorde: WITCH,
    mirrorConcorde: true, // she flies east on that leg, so face her the other way
    bird: bat,
    ufo: GHOST,
    aurora: FOG,
    tree: deadTree,
    moon: harvestMoon,
    extras,
    cloud: 'rgba(206,196,222,0.82)',
    ground: {
      grass: '#2f3524',
      grassEdge: '#242a1b',
      rockFar: '#4a3f5c',
      rockMid: '#5a4a6b',
      rockNear: '#463a56',
      rockShade: '#372c45',
      snow: '#d8cfe4',
      snowShade: '#b9adc9',
      trail: 'rgba(255,214,150,0.55)',
      trailDone: '#ef8521',
    },
  },
};
