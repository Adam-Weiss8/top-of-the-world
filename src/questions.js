// Loads the question queue: every src/data/days/day_N.json, bundled at build time.
// Edit days with the admin page (npm run dev, then /admin.html). See src/queue.js for the format.

const files = import.meta.glob('./data/days/*.json', { eager: true, import: 'default' });

/** Day number → { day, questions }. */
export const DAYS = new Map(Object.values(files).map((d) => [d.day, d]));

/** Normalized ranking: [{ code, value, rank }], with ties sharing a rank. */
export function rankingOf(question) {
  return question.ranking.map(([code, value, rank], i) => ({ code, value, rank: rank ?? i + 1 }));
}
