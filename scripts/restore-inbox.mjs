// Puts unpublished questions back after a repair, without putting back ones already published.
//
//   node scripts/restore-inbox.mjs <backup folder>
//
// The inbox is short-lived by design: scheduling a set turns it into a day file and deletes
// the entry. Restoring blindly would re-add sets that have already aired, and they would be
// scheduled a second time as duplicate days. So each one is checked against the queue first.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fingerprint, scheduledFingerprints } from './question-sets.js';

const backup = process.argv[2];
if (!backup) {
  console.log('  (nothing to restore)');
  process.exit(0);
}

const DAYS = new URL('../src/data/days/', import.meta.url);
const INBOX = fileURLToPath(new URL('../src/data/inbox/', import.meta.url));
const from = backup.replace(/[\/]+$/, '') + '/inbox/';

const files = (await readdir(from).catch(() => [])).filter((f) => f.endsWith('.json'));
if (!files.length) {
  console.log('  nothing unpublished to put back');
  process.exit(0);
}

const already = await scheduledFingerprints(DAYS);
await mkdir(INBOX, { recursive: true });

let back = 0;
const done = [];
for (const f of files) {
  let set;
  try {
    set = JSON.parse(await readFile(from + f, 'utf8'));
  } catch {
    continue; // unreadable: leave it in the backup folder rather than guess
  }
  const day = already.get(fingerprint(set));
  if (day !== undefined) {
    done.push(`      "${set.author ?? 'a day'}" was already published as Day ${day}`);
    continue;
  }
  await writeFile(INBOX + f, JSON.stringify(set, null, 2) + '\n');
  back++;
}

console.log(`  put ${back} unpublished day(s) back`);
if (done.length) {
  console.log('  left these out, because they have already gone live:');
  done.forEach((d) => console.log(d));
}
