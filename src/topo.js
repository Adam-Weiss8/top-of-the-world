// Procedural, seamlessly tiling topographic contour patterns for the map.
// A sum of sine waves with whole-number frequencies is periodic over the tile,
// so contours traced from it with marching squares line up across tile edges.

const WAVES = [
  [1, 0, 1.0, 0.3],
  [0, 1, 1.0, 1.7],
  [1, 1, 0.7, 2.9],
  [2, -1, 0.5, 0.8],
  [-1, 2, 0.45, 4.1],
  [3, 1, 0.25, 5.3],
  [1, -3, 0.2, 2.2],
];

function height(u, v, seed) {
  let h = 0;
  for (const [fx, fy, amp, phase] of WAVES) {
    h += amp * Math.sin(2 * Math.PI * (fx * u + fy * v) + phase + seed);
  }
  return h;
}

/**
 * Returns an ImageData of `size`×`size` device pixels with contour lines drawn on
 * `background` (or transparent). Register it with map.addImage(..., { pixelRatio }).
 */
export function topoPattern({ size = 512, background = null, line, lineWidth = 1.5, levels = 14, seed = 0 }) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }

  const n = 128; // grid cells per side
  const step = size / n;
  const grid = [];
  for (let j = 0; j <= n; j++) {
    grid.push([]);
    for (let i = 0; i <= n; i++) grid[j].push(height(i / n, j / n, seed));
  }
  const lo = -3.2;
  const hi = 3.2;

  ctx.strokeStyle = line;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 1; k < levels; k++) {
    const level = lo + ((hi - lo) * k) / levels;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const corners = [
          [i, j, grid[j][i]],
          [i + 1, j, grid[j][i + 1]],
          [i + 1, j + 1, grid[j + 1][i + 1]],
          [i, j + 1, grid[j + 1][i]],
        ];
        const hits = [];
        for (let e = 0; e < 4; e++) {
          const [x1, y1, a] = corners[e];
          const [x2, y2, b] = corners[(e + 1) % 4];
          if ((a < level) !== (b < level)) {
            const t = (level - a) / (b - a);
            hits.push([(x1 + (x2 - x1) * t) * step, (y1 + (y2 - y1) * t) * step]);
          }
        }
        for (let h = 0; h + 1 < hits.length; h += 2) {
          ctx.moveTo(...hits[h]);
          ctx.lineTo(...hits[h + 1]);
        }
      }
    }
  }
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/** Lines of latitude/longitude every `step` degrees, as GeoJSON. */
export function graticule(step = 30) {
  const features = [];
  for (let lng = -180; lng <= 180; lng += step) {
    features.push(line(Array.from({ length: 33 }, (_, i) => [lng, -80 + i * 5])));
  }
  for (let lat = -60; lat <= 60; lat += step) {
    features.push(line(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat])));
  }
  return { type: 'FeatureCollection', features };
}

const line = (coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
