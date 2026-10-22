// The question queue: one file per day in src/data/days/day_N.json.
// Shared by the game, the admin page, its dev-server API, and `npm run check`,
// so it must stay free of browser- or Node-specific code.
//
// Day 1 is LAUNCH. Earlier days (0, -1, …) are test days that join the archive.
// Each day has 5 questions, levels 1–5 in order (Q1 easiest, Q5 hardest):
//
//   { "day": 4, "questions": [
//       { "level": 1, "prompt": "with the highest population", "source": "UN WPP 2024",
//         "ranking": [["IND", "1.45 billion"], ["CHN", "1.42 billion"], ["NPL", "8,849 m", 1], …] },
//       … ] }
//
// A ranking entry is [code, value] or [code, value, rank]; give tied entries the same rank.

export const LAUNCH = '2026-10-23'; // the date of Day 1
export const QUESTIONS_PER_DAY = 5;
export const MIN_ANSWERS = 10;
export const MAX_ANSWERS = 20;

const DAY_MS = 86_400_000;
const utc = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Day number for a YYYY-MM-DD date (LAUNCH is day 1). */
export const dayNumber = (key) => Math.round((utc(key) - utc(LAUNCH)) / DAY_MS) + 1;

/** YYYY-MM-DD date for a day number. */
export const dayDate = (n) => new Date(utc(LAUNCH) + (n - 1) * DAY_MS).toISOString().slice(0, 10);

export const fileName = (n) => `day_${n}.json`;

/**
 * Problems with a day, as { errors: [string], byQuestion: [[string] × 5] }.
 * `codes` is the set of country codes on the map.
 */
export function validateDay(day, codes) {
  const errors = [];
  const byQuestion = Array.from({ length: QUESTIONS_PER_DAY }, () => []);
  if (!Number.isInteger(day?.day)) errors.push('missing day number');
  const qs = day?.questions ?? [];
  if (qs.length !== QUESTIONS_PER_DAY) errors.push(`has ${qs.length} questions (needs ${QUESTIONS_PER_DAY})`);

  qs.slice(0, QUESTIONS_PER_DAY).forEach((q, i) => {
    const out = byQuestion[i];
    if (q.level !== i + 1) out.push(`should be level ${i + 1}`);
    if (!q.prompt?.trim()) out.push('needs a prompt');
    if (!q.source?.trim()) out.push('needs a source');
    const ranking = q.ranking ?? [];
    if (ranking.length < MIN_ANSWERS || ranking.length > MAX_ANSWERS) {
      out.push(`has ${ranking.length} answers (needs ${MIN_ANSWERS}–${MAX_ANSWERS})`);
    }
    const seen = new Set();
    let lastRank = 0;
    ranking.forEach(([code, , rank], j) => {
      const r = rank ?? j + 1;
      if (!codes.has(code)) out.push(`#${j + 1} "${code}" isn't a country on the map`);
      if (seen.has(code)) out.push(`#${j + 1} ${code} is listed twice`);
      if (r < lastRank || r > j + 1) out.push(`#${j + 1} ${code} has an impossible rank (${r})`);
      seen.add(code);
      lastRank = r;
    });
  });
  return { errors, byQuestion, ok: !errors.length && byQuestion.every((q) => !q.length) };
}

/** Pretty JSON with each ranking entry on one line, so day files diff nicely. */
export function formatDay(day) {
  const lines = ['{', `  "day": ${day.day},`, '  "questions": ['];
  day.questions.forEach((q, i) => {
    lines.push('    {');
    lines.push(`      "level": ${q.level},`);
    lines.push(`      "prompt": ${JSON.stringify(q.prompt)},`);
    lines.push(`      "source": ${JSON.stringify(q.source)},`);
    lines.push('      "ranking": [');
    q.ranking.forEach((entry, j) => {
      lines.push(`        ${JSON.stringify(entry)}${j < q.ranking.length - 1 ? ',' : ''}`);
    });
    lines.push('      ]');
    lines.push(`    }${i < day.questions.length - 1 ? ',' : ''}`);
  });
  lines.push('  ]', '}', '');
  return lines.join('\n');
}

/** A quick structural check (no country list needed) used to decide whether a day is playable. */
export const isPlayable = (day) =>
  day?.questions?.length === QUESTIONS_PER_DAY &&
  day.questions.every(
    (q, i) => q.level === i + 1 && q.prompt && q.ranking?.length >= MIN_ANSWERS && q.ranking.length <= MAX_ANSWERS
  );
