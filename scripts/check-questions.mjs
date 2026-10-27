// Checks every day in the question queue (src/data/days/) and reports how far ahead it runs.
// Exits non-zero if any saved day has problems, so it can gate a deploy.
import { readdir, readFile } from 'node:fs/promises';
import { validateDay, dayNumber, dayDate } from '../src/queue.js';
import { SOVEREIGN_OF, COUNTRY_COUNT, isCountry } from '../src/not-countries.js';

const dir = new URL('../src/data/days/', import.meta.url);
const countries = JSON.parse(await readFile(new URL('../src/data/countries.json', import.meta.url), 'utf8'));
const all = new Set(countries.features.map((f) => f.properties.code));
const codes = new Set([...all].filter(isCountry)); // only official countries can be answers

// Guard against the map data and the not-a-country list drifting apart, which `npm run
// countries` could do silently if Natural Earth changes upstream.
const dataProblems = [
  ...Object.keys(SOVEREIGN_OF).filter((c) => !all.has(c)).map((c) => `${c} is no longer in countries.json`),
  ...Object.entries(SOVEREIGN_OF)
    .filter(([, sov]) => !codes.has(sov))
    .map(([c, sov]) => `${c} points at "${sov}", which isn't a country on the map`),
  ...(codes.size === COUNTRY_COUNT ? [] : [`the map has ${codes.size} countries, expected ${COUNTRY_COUNT}`]),
];
if (dataProblems.length) {
  console.log('✗ src/not-countries.js doesn\'t match src/data/countries.json:');
  for (const p of dataProblems) console.log(`    ${p}`);
  console.log('');
}

// Keep the filename alongside each day so a clash can name both culprits. A plain
// Map(entries) would let the second file silently overwrite the first and lose a whole set.
const days = new Map();
const from = new Map();
const clashes = [];
for (const f of (await readdir(dir)).filter((f) => f.endsWith('.json'))) {
  const day = JSON.parse(await readFile(new URL(f, dir), 'utf8'));
  if (days.has(day.day)) clashes.push(`day ${day.day} is claimed by both ${from.get(day.day)} and ${f}`);
  else from.set(day.day, f);
  days.set(day.day, day);
}
if (clashes.length) {
  console.log('✗ Two files claim the same day — one set of questions would be dropped silently:');
  for (const c of clashes) console.log(`    ${c}`);
  console.log('');
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
process.exitCode = problems || dataProblems.length || clashes.length ? 1 : 0;
