// Telling whether a set of questions has already been scheduled as a day.
//
// Needed because the inbox is deliberately short-lived: when a set is scheduled it becomes
// src/data/days/day_N.json and the inbox entry is deleted. A copy that hasn't pulled since
// then still has the entry, and putting it back would publish the same questions twice.
//
// There is no id linking the two (older days predate the inbox entirely), so sets are matched
// on what they actually are: who wrote them and the five prompts, in order.
import { readdir, readFile } from 'node:fs/promises';

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** What makes a set of questions that set, regardless of how it was filed. */
export const fingerprint = (set) =>
  [norm(set?.author), ...(set?.questions ?? []).map((q) => norm(q?.prompt))].join(' :: ');

/** Fingerprints of every day already in the queue, mapped to its day number. */
export async function scheduledFingerprints(daysDir) {
  const out = new Map();
  for (const f of (await readdir(daysDir).catch(() => [])).filter((f) => f.endsWith('.json'))) {
    try {
      const day = JSON.parse(await readFile(new URL(f, daysDir), 'utf8'));
      out.set(fingerprint(day), day.day);
    } catch {
      // a half-written day file shouldn't stop the check
    }
  }
  return out;
}
