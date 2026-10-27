import { Map, Marker, AttributionControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import countries from './data/countries.json';
import { topoPattern, graticule } from './topo.js';
import { pointsFor, tier } from './daily.js';
import { SOVEREIGN_OF, isCountry } from './not-countries.js';
import { THEME } from './themes.js';

setWorkerUrl(workerUrl);

// A season can retint the board (see src/themes.js). The reveal colours below are deliberately
// not themeable: they are the share emoji 🟨🟪🟦🟩, so recolouring them would desync what a
// player pastes into a group chat from what they actually saw.
const COLORS = {
  ocean: '#b9d4df',
  oceanLine: 'rgba(255,255,255,0.55)',
  land: '#eef1ea',
  landLine: 'rgba(90,110,96,0.16)',
  hover: '#dfe8d8',
  picked: '#d63a2f',
  border: '#7d8f95',
  coastGlow: '#ffffff',
  grid: 'rgba(44,62,80,0.18)',
  ink: '#22313f',
  ...THEME.map,
  // reveal colours, matching the score tiers (🟨🟪🟦🟩)
  gold: '#f6c21b',
  purple: '#a685d1',
  blue: '#5c9fd6',
  green: '#6dbb84',
};

const SOURCE = 'countries';
// The full span of longitudes, so nothing sits outside the starting view. It used to stop at
// -165, which cut off everything in the far eastern Pacific: Samoa's own label point is at
// -172 and Tonga's at -175, so their dots were off-screen, and the islands Fiji and Kiribati
// keep on the far side of the antimeridian were unreachable.
const WORLD = [[-180, -56], [180, 76]];
const BASE_PADDING = 10;
const BADGE_LIMIT = 10; // rank badges for the top 10 (plus the player's pick), to keep Europe legible
const GLOW_MS = 1600;

const byCode = Object.fromEntries(countries.features.map((f) => [f.properties.code, f.properties]));

export const countryName = (code) => byCode[code]?.name ?? code;

const addTo = (padding, n) => Object.fromEntries(Object.entries(padding).map(([k, v]) => [k, v + n]));

// Bounding box of each country's largest polygon, so Russia's sliver across the
// antimeridian (or far-flung islands) doesn't stretch the box around the whole globe.
const mainland = Object.fromEntries(
  countries.features.map(({ properties, geometry }) => {
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const box = (ring) => {
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    };
    const area = ([w, s, e, n]) => (e - w) * (n - s);
    const biggest = polys.map((poly) => box(poly[0])).sort((a, b) => area(b) - area(a))[0];
    return [properties.code, biggest];
  })
);

function boundsOf(codes) {
  const boxes = codes.map((c) => mainland[c]).filter(Boolean);
  return [
    [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1]))],
    [Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))],
  ];
}

// Countries too small to hit at world zoom get a clickable dot at their label point.
// Territories never do: a dot in the ocean that picks someone else's country would mislead.
//
// What counts as too small is measured on the biggest single landmass, NOT on the country's
// bounding box. A box is the wrong ruler for an archipelago: Kiribati scatters islands of
// 0.03 square degrees across a span of 5,000, and the Marshall Islands' largest island is
// smaller than St. Kitts, which gets a dot. Measuring the box left every Pacific island
// nation without one — the hardest countries on the map to tap.
const DOT_AREA = 1; // square degrees; at world zoom a degree is about a pixel

// Shoelace area of a polygon's outer ring, in square degrees. Flat lon/lat, so it reads a
// little small towards the poles — fine for "is this a pixel or two across?".
const ringArea = (ring) => {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(sum / 2);
};

const biggestLandmass = ({ type, coordinates }) =>
  Math.max(...(type === 'Polygon' ? [coordinates] : coordinates).map((poly) => ringArea(poly[0])));

const tinyDots = {
  type: 'FeatureCollection',
  features: countries.features
    .filter((f) => isCountry(f.properties.code) && biggestLandmass(f.geometry) < DOT_AREA)
    .map(({ properties: { code, name, lx, ly } }) => ({
      type: 'Feature',
      properties: { code, name },
      geometry: { type: 'Point', coordinates: [lx, ly] },
    })),
};
const isTiny = new Set(tinyDots.features.map((f) => f.properties.code));

// During play: hover and the red pick. On reveal: each ranked country in its tier colour,
// and a pick that missed the list stays red.
const fillColor = [
  'case',
  ['==', ['coalesce', ['feature-state', 'tier'], ''], 'gold'], COLORS.gold,
  ['==', ['coalesce', ['feature-state', 'tier'], ''], 'purple'], COLORS.purple,
  ['==', ['coalesce', ['feature-state', 'tier'], ''], 'blue'], COLORS.blue,
  ['==', ['coalesce', ['feature-state', 'tier'], ''], 'green'], COLORS.green,
  ['boolean', ['feature-state', 'picked'], false], COLORS.picked,
  ['boolean', ['feature-state', 'hover'], false], COLORS.hover,
  COLORS.land,
];
const isRanked = ['!=', ['coalesce', ['feature-state', 'tier'], ''], ''];

/**
 * Renders the playable world map. `onPick({ code, name })` fires when a country is clicked
 * while picking is enabled.
 */
export function createMap(container, { onPick }) {
  const map = new Map({
    container,
    attributionControl: false,
    // The world repeats east-west. Mercator cannot fit 360 degrees on a tall phone — the
    // map is never allowed to zoom out past the point where the world fills the viewport's
    // HEIGHT, which on a 390x793 stage leaves only about half the planet across. Without
    // copies that half is all you get and the Pacific sits behind a hard edge; with them
    // there is no edge, panning runs on forever and Fiji and Kiribati stop being split in
    // two by the antimeridian.
    renderWorldCopies: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxZoom: 7,
    style: {
      version: 8,
      sources: {
        [SOURCE]: { type: 'geojson', data: countries, promoteId: 'code' },
        tiny: { type: 'geojson', data: tinyDots, promoteId: 'code' },
        graticule: { type: 'geojson', data: graticule(30) },
      },
      layers: [
        { id: 'ocean', type: 'background', paint: { 'background-color': COLORS.ocean } },
        // 'ocean-topo' and 'land-topo' pattern layers are inserted on load, once their images exist.
        {
          id: 'grid',
          type: 'line',
          source: 'graticule',
          paint: { 'line-color': COLORS.grid, 'line-width': 1, 'line-dasharray': [3, 3] },
        },
        {
          id: 'coast-glow',
          type: 'line',
          source: SOURCE,
          paint: { 'line-color': COLORS.coastGlow, 'line-width': 9, 'line-blur': 7, 'line-opacity': 0.8 },
        },
        { id: 'country-fill', type: 'fill', source: SOURCE, paint: { 'fill-color': fillColor } },
        {
          id: 'country-border',
          type: 'line',
          source: SOURCE,
          paint: {
            'line-color': ['case', isRanked, COLORS.ink, COLORS.border],
            'line-width': ['case', isRanked, 1.3, 0.7],
          },
        },
        {
          // A pulsing gold halo around #1, animated on reveal.
          id: 'summit-glow',
          type: 'line',
          source: SOURCE,
          filter: ['==', ['get', 'code'], '__none__'],
          paint: { 'line-color': COLORS.gold, 'line-width': 8, 'line-blur': 6, 'line-opacity': 0.9 },
        },
        {
          // The score reveal: a pulsing halo around the player's pick, in their tier colour.
          id: 'pick-glow',
          type: 'line',
          source: SOURCE,
          filter: ['==', ['get', 'code'], '__none__'],
          paint: { 'line-color': '#ffffff', 'line-width': 0, 'line-blur': 8, 'line-opacity': 0.9 },
        },
        {
          id: 'country-picked-outline',
          type: 'line',
          source: SOURCE,
          paint: {
            'line-color': ['case', isRanked, COLORS.picked, COLORS.ink],
            'line-width': ['case', ['boolean', ['feature-state', 'picked'], false], 2.5, 0],
          },
        },
        {
          id: 'tiny-dots',
          type: 'circle',
          source: 'tiny',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3.5, 5, 6],
            'circle-color': fillColor,
            'circle-stroke-color': ['case', ['boolean', ['feature-state', 'picked'], false], COLORS.picked, COLORS.ink],
            'circle-stroke-width': ['case', ['boolean', ['feature-state', 'picked'], false], 2.5, 1.2],
          },
        },
      ],
    },
  });

  map.addControl(
    new AttributionControl({ compact: true, customAttribution: 'Borders: Natural Earth' }),
    'bottom-left'
  );
  map.fitBounds(WORLD, { padding: BASE_PADDING, duration: 0 });

  // Copies mean there is no longer an edge to stop a zoom-out, so hold the floor at a single
  // world: any further out and the map would show two or three Earths side by side. On a
  // phone this sits below the height limit above, so it changes nothing there.
  const holdOneWorld = () => {
    const width = map.getContainer().clientWidth - BASE_PADDING * 2;
    if (width > 0) map.setMinZoom(Math.log2(width / 512));
  };
  holdOneWorld();
  map.on('resize', holdOneWorld);

  map.once('load', () => {
    const ratio = { pixelRatio: 2 };
    map.addImage('ocean-topo', topoPattern({ background: COLORS.ocean, line: COLORS.oceanLine, seed: 0 }), ratio);
    map.addImage('land-topo', topoPattern({ line: COLORS.landLine, lineWidth: 1.2, levels: 18, seed: 2 }), ratio);
    map.addLayer({ id: 'ocean-topo', type: 'background', paint: { 'background-pattern': 'ocean-topo' } }, 'grid');
    map.addLayer(
      { id: 'land-topo', type: 'fill', source: SOURCE, paint: { 'fill-pattern': 'land-topo' } },
      'country-border'
    );
  });

  let enabled = true;
  let hovered = null;
  let picked = null;
  let revealed = [];
  let markers = [];
  let glowFrame = 0;
  let revealFocus = null; // bounds framed by the current reveal
  let spotFrame = 0;

  const pinEl = document.createElement('div');
  pinEl.className = 'pin';
  pinEl.innerHTML =
    '<svg viewBox="0 0 24 34" width="26" height="37"><path d="M3 2v31" stroke="#22313f" stroke-width="2.4" stroke-linecap="round"/><path d="M4 3h17l-4 5.5 4 5.5H4z" fill="#d63a2f" stroke="#22313f" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const pin = new Marker({ element: pinEl, anchor: 'bottom-left', offset: [-4, 0] });

  const setState = (code, state) => {
    if (!code) return;
    map.setFeatureState({ source: SOURCE, id: code }, state);
    if (isTiny.has(code)) map.setFeatureState({ source: 'tiny', id: code }, state);
  };

  // A territory isn't pickable, so a hit on one counts for the country it belongs to:
  // Greenland picks Denmark, Puerto Rico picks the United States.
  const asCountry = (props) => {
    if (!props) return null;
    const code = SOVEREIGN_OF[props.code];
    return code ? byCode[code] ?? null : props;
  };

  // Forgiving hit test: a tiny-country dot near the pointer wins, then the country under
  // it, then any country within a few pixels (for near-misses along coastlines).
  const countryAt = ({ x, y }) => {
    const box = (r) => [[x - r, y - r], [x + r, y + r]];
    const dots = map.queryRenderedFeatures(box(12), { layers: ['tiny-dots'] });
    if (dots.length) {
      // project() already resolves to the copy nearest the centre, and every dot's label
      // point is a real in-range coordinate, so plain screen distance is right even with
      // copies rendering either side of the antimeridian.
      const dist = (f) => {
        const p = map.project(f.geometry.coordinates);
        return (p.x - x) ** 2 + (p.y - y) ** 2;
      };
      return dots.sort((a, b) => dist(a) - dist(b))[0].properties;
    }
    const under = map.queryRenderedFeatures([x, y], { layers: ['country-fill'] })[0];
    return asCountry((under ?? map.queryRenderedFeatures(box(6), { layers: ['country-fill'] })[0])?.properties);
  };

  // Fit `bounds` into whatever part of the map isn't covered by a panel.
  const frame = (bounds, padding = {}, maxZoom = 3.5) => {
    // absolutePadding makes the result carry the padding, so easeTo centres the bounds in
    // the uncovered area.
    const fit = map.cameraForBounds(bounds, {
      padding: Object.fromEntries(
        ['top', 'right', 'bottom', 'left'].map((side) => [side, BASE_PADDING + (padding[side] ?? 0)])
      ),
      absolutePadding: true,
      maxZoom,
    });
    if (fit) map.easeTo({ ...fit, duration: 900 });
  };

  function glow() {
    cancelAnimationFrame(glowFrame);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const step = (now) => {
      const t = (Math.sin((now / GLOW_MS) * 2 * Math.PI) + 1) / 2;
      map.setPaintProperty('summit-glow', 'line-width', 5 + 9 * t);
      map.setPaintProperty('summit-glow', 'line-opacity', 0.55 + 0.4 * t);
      glowFrame = requestAnimationFrame(step);
    };
    glowFrame = requestAnimationFrame(step);
  }

  function badge(code, html, cls) {
    const p = byCode[code];
    if (!p) return;
    const el = document.createElement('div');
    el.className = `badge ${cls}`;
    el.innerHTML = html;
    markers.push(new Marker({ element: el }).setLngLat([p.lx, p.ly]).addTo(map));
  }

  function clearReveal() {
    cancelAnimationFrame(glowFrame);
    revealed.forEach((code) => setState(code, { tier: null }));
    map.setFilter('summit-glow', ['==', ['get', 'code'], '__none__']);
    markers.forEach((m) => m.remove());
    markers = [];
    revealed = [];
    revealFocus = null;
  }

  function select(code) {
    setState(picked, { picked: false });
    setState(code, { picked: true });
    picked = code;
  }

  map.on('mousemove', (e) => {
    if (!enabled) return;
    const code = countryAt(e.point)?.code ?? null;
    if (code === hovered) return;
    setState(hovered, { hover: false });
    setState(code, { hover: true });
    hovered = code;
    map.getCanvas().style.cursor = code ? 'pointer' : '';
  });

  map.on('mouseout', () => {
    setState(hovered, { hover: false });
    hovered = null;
  });

  map.on('click', (e) => {
    if (!enabled) return;
    const country = countryAt(e.point);
    if (!country) return;
    const { code, name } = country;
    select(code);
    pin.setLngLat(e.lngLat).addTo(map);
    pinEl.classList.remove('drop');
    void pinEl.offsetWidth; // restart the drop animation
    pinEl.classList.add('drop');
    onPick({ code, name });
  });

  const ready = new Promise((resolve) => map.once('load', resolve));

  return {
    ready,
    /**
     * Colour a ranking onto the map: each country in its score-tier colour, #1 in pulsing,
     * sparkling gold, with rank badges for the top 10 and the player's pick. Stops accepting
     * picks. `padding` is the screen space covered by panels, so the answers stay in view.
     */
    reveal(ranking, pickedCode, padding = {}) {
      this.clearSpotlight();
      enabled = false;
      setState(hovered, { hover: false });
      map.getCanvas().style.cursor = '';
      pin.remove();
      clearReveal();
      select(pickedCode);

      const n = ranking.length;
      for (const r of ranking) setState(r.code, { tier: tier(pointsFor(r.rank, n)) });
      revealed = ranking.map((r) => r.code);

      const top = ranking.filter((r) => r.rank === 1).map((r) => r.code);
      map.setFilter('summit-glow', ['in', ['get', 'code'], ['literal', top]]);
      glow();

      const pickRank = ranking.find((r) => r.code === pickedCode)?.rank;
      for (const r of ranking) {
        if (r.rank > BADGE_LIMIT && r.code !== pickedCode) continue;
        const you = r.code === pickedCode ? '<em>you</em>' : '';
        badge(r.code, `${r.rank}${you}`, `${tier(pointsFor(r.rank, n))}${r.rank === 1 ? ' summit' : ''}${you ? ' you' : ''}`);
      }
      if (pickedCode && !pickRank) badge(pickedCode, '<em>you</em>', 'you miss');

      // Frame the top 10 and the pick; if that spans most of the globe, show the whole world.
      const focus = boundsOf(ranking.filter((r) => r.rank <= 10).map((r) => r.code).concat(pickedCode ?? []));
      revealFocus = focus[1][0] - focus[0][0] > 150 ? WORLD : focus;
      this.refit(padding);
    },
    /** Re-frame the current reveal after the panel covering the map changes size. */
    refit(padding = {}) {
      if (revealFocus) frame(revealFocus, { top: 30, right: 30, bottom: 30, left: 30, ...addTo(padding, 20) });
    },
    /** Stop accepting picks (e.g. while the journey scene plays). */
    lock() {
      enabled = false;
      setState(hovered, { hover: false });
      hovered = null;
    },
    /** Accept picks again (after a question finishes revealing). */
    unlock() {
      enabled = true;
    },
    /**
     * Glide to the player's pick and ring it with a pulsing glow. `strength` (0–1) scales
     * the halo with how close the answer was; 0 means no glow at all.
     */
    spotlight(code, { color, strength }) {
      cancelAnimationFrame(spotFrame);
      pin.remove();
      const box = byCode[code] && boundsOf([code]);
      if (box) frame(box, { top: 160, right: 60, bottom: 120, left: 60 }, isTiny.has(code) ? 4.5 : 3.5);
      if (!strength) return;
      map.setFilter('pick-glow', ['==', ['get', 'code'], code]);
      map.setPaintProperty('pick-glow', 'line-color', color);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        map.setPaintProperty('pick-glow', 'line-width', 4 + 14 * strength);
        return;
      }
      const start = performance.now();
      const step = (now) => {
        const t = (Math.sin(((now - start) / 700) * Math.PI) + 1) / 2;
        map.setPaintProperty('pick-glow', 'line-width', (4 + 14 * strength) * (0.6 + 0.4 * t));
        spotFrame = requestAnimationFrame(step);
      };
      spotFrame = requestAnimationFrame(step);
    },
    clearSpotlight() {
      cancelAnimationFrame(spotFrame);
      map.setFilter('pick-glow', ['==', ['get', 'code'], '__none__']);
    },
    /** Clear any reveal and the pick for the next question. */
    reset() {
      this.clearSpotlight();
      clearReveal();
      select(null);
      pin.remove();
      enabled = true;
      frame(WORLD);
    },
    resize: () => map.resize(),
    raw: map, // for debugging in the console
  };
}
