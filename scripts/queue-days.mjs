// Moves every finished set in src/data/inbox/ onto the end of the queue in src/data/days/.
//
//   npm run queue            -> schedule what's ready
//   npm run queue -- --dry   -> say what would happen, change nothing
//
// Writers never pick a day number. They save a set to the inbox under a filename nobody else
// can collide with, push it, and this assigns the next free day — so two people writing at the
// same time just end up on consecutive days instead of fighting over one file.
//
// Two rules keep the schedule stable:
//   - oldest set first, so days air roughly in the order they were written
//   - never assign a day that has already been played, so a set pushed late is appended rather
//     than dropped in front of a puzzle someone has already seen
import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateDay, formatDay, fileName, dayNumber, dayDate } from '../src/queue.js';
import { isCountry } from '../src/not-countries.js';

const DAYS = fileURLToPath(new URL('../src/data/days/', import.meta.url));
const INBOX = fileURLToPath(new URL('../src/data/inbox/', import.meta.url));
const dry = process.argv.includes('--dry');

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = dayNumber(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);

const countries = JSON.parse(await readFile(new URL('../src/data/countries.json', import.meta.url), 'utf8'));
const codes = new Set(countries.features.map((f) => f.properties.code).filter(isCountry));

await mkdir(INBOX, { recursive: true });
await mkdir(DAYS, { recursive: true });

const taken = new Set();
for (const f of (await readdir(DAYS)).filter((f) => /^day_-?\d+\.json$/.test(f))) {
  taken.add(JSON.parse(await readFile(DAYS + f, 'utf8')).day);
}

// Sorting by filename sorts by the timestamp it starts with, so sets air in writing order.
const pending = (await readdir(INBOX)).filter((f) => f.endsWith('.json')).sort();
if (!pending.length) {
  console.log('Nothing waiting in the inbox.');
  process.exit(0);
}

// The first slot that is both free and still in the future.
let next = Math.max(today, ...(taken.size ? [...taken] : [today])) + 1;
const freeSlot = () => {
  while (taken.has(next) || next <= today) next++;
  return next;
};

let scheduled = 0;
let held = 0;
for (const f of pending) {
  let set;
  try {
    set = JSON.parse(await readFile(INBOX + f, 'utf8'));
  } catch (e) {
    console.log(`· held back ${f}: not valid JSON (${e.message})`);
    held++;
    continue;
  }

  const { ok, errors, byQuestion } = validateDay(set, codes, { scheduled: false });
  if (!ok) {
    console.log(`· held back ${f}: still needs work`);
    for (const e of errors) console.log(`      ${e}`);
    byQuestion.forEach((list, i) => list.forEach((e) => console.log(`      Q${i + 1}: ${e}`)));
    held++;
    continue;
  }

  const n = freeSlot();
  taken.add(n);
  const day = { day: n, author: set.author, questions: set.questions };
  if (!dry) {
    await writeFile(DAYS + fileName(n), formatDay(day));
    await unlink(INBOX + f);
  }
  console.log(`${dry ? '· would schedule' : '✓ scheduled'} ${f} as Day ${n} · ${dayDate(n)}${set.author ? ` (${set.author})` : ''}`);
  scheduled++;
}

console.log(
  `\n${dry ? 'Would schedule' : 'Scheduled'} ${scheduled} day(s)` +
    (held ? `, held back ${held} that aren't finished — they stay in the inbox.` : '.')
);
// Held-back sets are not a failure: the rest of the queue is fine and the deploy should carry on.
process.exit(0);
