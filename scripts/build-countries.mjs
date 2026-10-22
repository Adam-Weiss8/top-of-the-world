// Downloads Natural Earth 1:50m country polygons and writes a slim GeoJSON
// (code, name, label point, tiny flag per feature; coordinates rounded) to src/data/countries.json,
// plus the alternative English names the admin page uses to match pasted tables (src/data/aliases.json).
//
//   npm run countries              -> download from GitHub
//   npm run countries -- file.json -> use a local copy instead
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const OUT = new URL('../src/data/countries.json', import.meta.url);
const ALIASES_OUT = new URL('../src/data/aliases.json', import.meta.url);
const NAME_FIELDS = ['NAME', 'NAME_LONG', 'NAME_EN', 'ADMIN', 'GEOUNIT', 'SUBUNIT', 'BRK_NAME', 'FORMAL_EN', 'NAME_CIAWF', 'NAME_SORT', 'ABBREV'];

// Countries whose whole extent is smaller than this (in square degrees) are too small
// to click at world zoom, so the map also draws them as a dot at their label point.
const TINY_AREA = 2;

const localPath = process.argv[2];
const raw = localPath
  ? JSON.parse(await readFile(localPath, 'utf8'))
  : await (await fetch(SOURCE)).json();

// ~1 km precision, dropping points that round onto the previous one.
const roundRing = (ring) => {
  const out = [];
  for (const [x, y] of ring) {
    const p = [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
    const last = out.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
};
const roundPolygon = (rings) => rings.map(roundRing).filter((r) => r.length >= 4);

const extentArea = (geometry) => {
  const pts = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).flat(2);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
};

// Sovereign countries claim their ISO code first; dependencies sharing it (e.g. Australia's
// Ashmore and Cartier Islands) fall back to their own Natural Earth code.
const isCountry = (p) => !/Dependency|Lease|Indeterminate/.test(p.TYPE);
const sorted = raw.features
  .filter((f) => f.properties.ADM0_A3 !== 'ATA') // Antarctica isn't playable
  .sort((a, b) => isCountry(b.properties) - isCountry(a.properties));

const used = new Set();
const aliases = {};
const features = sorted.map((f) => {
  const p = f.properties;
  let code = p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3;
  if (used.has(code)) code = p.ADM0_A3;
  used.add(code);
  aliases[code] = [...new Set(NAME_FIELDS.map((k) => p[k]).filter((v) => typeof v === 'string' && v.trim()))];

  const geometry =
    f.geometry.type === 'Polygon'
      ? { type: 'Polygon', coordinates: roundPolygon(f.geometry.coordinates) }
      : { type: 'MultiPolygon', coordinates: f.geometry.coordinates.map(roundPolygon).filter((p) => p.length) };

  return {
    type: 'Feature',
    properties: {
      code,
      name: p.NAME,
      lx: Math.round(p.LABEL_X * 100) / 100,
      ly: Math.round(p.LABEL_Y * 100) / 100,
      ...(extentArea(f.geometry) < TINY_AREA ? { tiny: true } : {}),
    },
    geometry,
  };
});

await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ type: 'FeatureCollection', features }));
await writeFile(ALIASES_OUT, JSON.stringify(aliases));
console.log(
  `Wrote ${features.length} countries (${features.filter((f) => f.properties.tiny).length} tiny) to ${OUT.pathname}`
);
