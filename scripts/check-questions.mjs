// Checks every day in the question queue (src/data/days/) and reports how far ahead it runs.
// Exits non-zero if any saved day has problems, so it can gate a deploy.
import { readdir, readFile } from 'node:fs/promises';
import { validateDay, dayNumber, dayDate } from '../src/queue.js';

const dir = new URL('../src/data/days/', import.meta.url);
const countries = JSON.parse(await readFile(new URL('../src/data/countries.json', import.meta.url), 'utf8'));
const codes = new Set(countries.features.map((f) => f.properties.code));

const days = new Map();
for (const f of (await readdir(dir)).filter((f) => f.endsWith('.json'))) {
  const day = JSON.parse(await readFile(new URL(f, dir), 'utf8'));
  days.set(day.day, day);
}

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = dayNumber(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);

let problems = 0;
for (const n of [...days.keys()].sort((a, b) => a - b)) {
  const { ok, errors, byQuestion } = validateDay(days.get(n), codes);
  const tag = n === today ? ' (today)' : n < today ? ' (archive)' : '';
  if (ok) {
    console.log(`✓ Day ${n} · ${dayDate(n)}${tag}`);
    continue;
  }
  problems++;
  console.log(`✗ Day ${n} · ${dayDate(n)}${tag}`);
  for (const e of errors) console.log(`    ${e}`);
  byQuestion.forEach((list, i) => list.forEach((e) => console.log(`    Q${i + 1}: ${e}`)));
}

let ready = 0;
while (days.has(today + 1 + ready) && validateDay(days.get(today + 1 + ready), codes).ok) ready++;
console.log(
  `\nToday is Day ${today}. ${ready} day(s) queued after today` +
    (ready ? `, through Day ${today + ready} (${dayDate(today + ready)}).` : '.')
);
if (problems) console.log(`${problems} day(s) need fixing; they'll fall back to the archive mix until then.`);
process.exitCode = problems ? 1 : 0;
