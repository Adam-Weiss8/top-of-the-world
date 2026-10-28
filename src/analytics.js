// Counting how many people play, and nothing else.
//
// GoatCounter (cookieless, no personal data, no consent banner needed) handles page visits by
// itself from the snippet in index.html. This module is only for the two moments that say
// somebody actually played, rather than just opened the page.
//
// Every call is guarded so the numbers stay honest:
//   - dev builds never count, so writing questions doesn't look like playing
//   - previewing a specific day or set never counts, for the same reason
//   - if the async snippet hasn't loaded (or an ad blocker ate it) this quietly does nothing

const live = !import.meta.env.DEV && !new URLSearchParams(location.search).has('day') && !new URLSearchParams(location.search).has('set');

/**
 * Record one event. `path` is what shows up in the dashboard, so keep it stable and plain —
 * "started", not "started-climb-12" — or the daily chart fragments into a new row every day.
 */
export function track(path, title) {
  if (!live) return;
  try {
    window.goatcounter?.count?.({ path, title, event: true });
  } catch {
    // analytics must never break the game
  }
}
