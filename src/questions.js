// Loads the question queue: every src/data/days/day_N.json, bundled at build time.
// Edit days with the admin page (npm run dev, then /admin.html). See src/queue.js for the format.

const files = import.meta.glob('./data/days/*.json', { eager: true, import: 'default' });

/**
 * Day number → { day, questions }.
 *
 * Built one at a time rather than straight from a Map constructor: duplicate keys there mean
 * the last one silently wins, so two files both claiming the same day would quietly drop a
 * whole set of questions. Scheduling is automatic (see scripts/queue-days.mjs) so this should
 * never happen — if it does, it's a bug worth hearing about rather than losing someone's work.
 */
export const DAYS = new Map();
for (const [path, day] of Object.entries(files)) {
  if (DAYS.has(day.day)) {
    throw new Error(`Two files both claim day ${day.day} — ${path} is one of them. Run npm run check.`);
  }
  DAYS.set(day.day, day);
}

/** Normalized ranking: [{ code, value, rank }], with ties sharing a rank. */
export function rankingOf(question) {
  return question.ranking.map(([code, value, rank], i) => ({ code, value, rank: rank ?? i + 1 }));
}
