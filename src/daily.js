import { DAYS, rankingOf } from './questions.js';
import { dayNumber, isPlayable, QUESTIONS_PER_DAY } from './queue.js';

export { QUESTIONS_PER_DAY };
export const MAX_POINTS = 200;
export const MAX_TOTAL = QUESTIONS_PER_DAY * MAX_POINTS;

/** Local calendar date as YYYY-MM-DD, so the puzzle flips at the player's midnight. */
export function todayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const puzzleNumber = dayNumber;

// Small deterministic PRNG so everyone gets the same mix on the same day.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Today's puzzle: { questions, author }. The queued day if it's ready, otherwise a mix from
 * the archive (every playable earlier day) with one random question per difficulty level,
 * which has no single author.
 */
export function puzzleFor(key) {
  const n = dayNumber(key);
  const queued = DAYS.get(n);
  if (isPlayable(queued)) return { questions: queued.questions, author: queued.author?.trim() || null };
  return { questions: archiveMix(n), author: null };
}

function archiveMix(n) {

  const playable = [...DAYS.values()].filter(isPlayable);
  const earlier = playable.filter((d) => d.day < n);
  const archive = (earlier.length ? earlier : playable).flatMap((d) => d.questions);
  const rand = mulberry32(n * 7919 + 13);
  const picked = [];
  for (let level = 1; level <= QUESTIONS_PER_DAY; level++) {
    const pool = archive.filter((q) => q.level === level && !picked.includes(q));
    const from = pool.length ? pool : archive.filter((q) => !picked.includes(q));
    picked.push(from[Math.floor(rand() * from.length)]);
  }
  return picked;
}

// Points by rank for a full 20-answer list: steep at the top, then roughly 8 per rank.
const CURVE = [200, 180, 165, 150, 138, 128, 118, 108, 99, 90, 82, 74, 66, 58, 50, 42, 34, 26, 18, 10];

/**
 * Points for finishing at `rank` on a list of `length` answers. Shorter lists are
 * stretched over the same curve, so #1 is always 200 and the last place always 10.
 */
export function pointsFor(rank, length) {
  if (length <= 1) return MAX_POINTS;
  const at = ((rank - 1) / (length - 1)) * (CURVE.length - 1);
  const i = Math.min(Math.floor(at), CURVE.length - 2);
  return Math.round(CURVE[i] + (CURVE[i + 1] - CURVE[i]) * (at - i));
}

/** Points for picking `code`, plus its rank and value (both null if it's not on the list). */
export function score(question, code) {
  const ranking = rankingOf(question);
  const hit = ranking.find((r) => r.code === code);
  if (!hit) return { rank: null, value: null, points: 0 };
  return { rank: hit.rank, value: hit.value, points: pointsFor(hit.rank, ranking.length) };
}

/**
 * Colour tier for a question's points. On a 20-answer list these line up with
 * #1 gold, #2–3 purple, #4–10 blue, #11–20 green; shorter lists scale with the curve.
 */
export function tier(points) {
  if (points >= MAX_POINTS) return 'gold';
  if (points >= 152) return 'purple';
  if (points >= 86) return 'blue';
  if (points > 0) return 'green';
  return 'grey';
}

export const TIER_EMOJI = { gold: '🟨', purple: '🟪', blue: '🟦', green: '🟩', grey: '⬜' };
