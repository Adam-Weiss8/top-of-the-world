// Seasonal themes. One theme is active at a time; everything else reads it from `THEME`.
//
// A theme supplies three separate things, and no colour is defined in more than one place:
//   map   — overrides merged over the COLORS in map.js (which also feed the topo patterns)
//   sky   — replaces the altitude colour stops in journey.js
//   art   — SVG artwork swapped into the climb scene, never the motion around it
// The chrome's colours are NOT here: they live in style.css under :root[data-theme='<name>'],
// keyed off the attribute this module sets.
//
// Adding a season is this file's registry plus one data module beside it.

import { dayDate } from './queue.js';
import { halloween } from './themes/halloween.js';

const THEMES = [halloween];

const DEFAULT = { name: 'default', themeColor: '#eef1ea', map: {}, sky: null, art: {} };

/**
 * The theme for a given date, or the default one. Exported so it can be checked without a
 * browser — the date rule is the part that has to be right at midnight with nobody watching.
 */
export function themeFor(date) {
  return THEMES.find((t) => t.when(date)) ?? DEFAULT;
}

/** Look a theme up by name; `none` (or anything unknown) gives the default. */
export const themeNamed = (name) => THEMES.find((t) => t.name === name) ?? DEFAULT;

/**
 * Resolve the active theme:
 *   1. ?theme=<name> wins everywhere, in production too, so a themed link can be shared and
 *      tested out of season. ?theme=none forces the plain look.
 *   2. In dev, ?day=N takes the theme from that day's date, so previewing a queued day
 *      previews its theme too.
 *   3. Otherwise the player's local date — the same basis as todayKey(), so the theme turns
 *      over at local midnight exactly when the puzzle does.
 */
function resolve() {
  if (typeof location === 'undefined') return DEFAULT;
  const params = new URLSearchParams(location.search);
  const forced = params.get('theme');
  if (forced !== null) return themeNamed(forced);

  const day = import.meta.env?.DEV ? params.get('day') : null;
  // noon, so a timezone can never nudge the date onto the day either side
  const date = day !== null && day !== '' ? new Date(`${dayDate(Number(day))}T12:00:00`) : new Date();
  return themeFor(date);
}

export const THEME = resolve();

// Mark the document so style.css can restyle the chrome, and match the browser's UI colour
// to it (the address bar on Android, the status bar in an installed PWA).
if (typeof document !== 'undefined') {
  if (THEME.name !== 'default') document.documentElement.dataset.theme = THEME.name;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && THEME.themeColor) meta.content = THEME.themeColor;
}
