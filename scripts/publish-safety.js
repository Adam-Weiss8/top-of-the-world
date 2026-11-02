// Keeping a writer's copy out of the states that strand it.
//
// The inbox is short-lived by design: once a set is scheduled it becomes a day file and the
// inbox entry is deleted. A copy that has not pulled since still holds that entry, so
// committing it again means modifying a file the other side deleted. That is a modify/delete
// conflict, the one kind rebase cannot resolve, and it is what has been leaving writers on a
// detached HEAD unable to publish anything ever again.
//
// So it is headed off rather than recovered from, and there is a last resort underneath that
// guarantees Publish can never leave somebody stuck.
import { mkdir, readdir, readFile, rename, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fingerprint, fingerprintsFromText } from './question-sets.js';

const INBOX = fileURLToPath(new URL('../src/data/inbox/', import.meta.url));
const DATA = fileURLToPath(new URL('../src/data/', import.meta.url));
const RESCUE = fileURLToPath(new URL('../rescued-questions/', import.meta.url));

const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');

/** Day numbers already live on the remote, keyed by what the questions actually are. */
async function liveDays(git) {
  const listing = (await git('ls-tree', '--name-only', 'origin/main', 'src/data/days/')).stdout;
  const names = listing.split('\n').map((n) => n.trim()).filter(Boolean);
  const texts = [];
  for (const n of names) texts.push((await git('show', 'origin/main:' + n)).stdout);
  return fingerprintsFromText(texts);
}

/**
 * Move any inbox set that has already gone live out of the way before committing.
 * Returns the day numbers they turned into, so the writer can be told what happened.
 */
export async function setAsidePublishedSets(git) {
  let live;
  try {
    live = await liveDays(git);
  } catch {
    return []; // offline or no remote yet: nothing sensible to compare against
  }

  const mine = (await readdir(INBOX).catch(() => [])).filter((n) => n.endsWith('.json'));
  const moved = [];
  for (const name of mine) {
    let set;
    try {
      set = JSON.parse(await readFile(INBOX + name, 'utf8'));
    } catch {
      continue;
    }
    const day = live.get(fingerprint(set));
    if (day === undefined) continue;
    const dir = RESCUE + stamp() + '/';
    await mkdir(dir, { recursive: true });
    await rename(INBOX + name, dir + name).catch(() => {});
    moved.push(day);
  }
  return moved;
}

/**
 * Last resort. Abort whatever is half-done, keep every question safe, and put the copy back
 * in step with the remote so the writer can carry on. Returns where their work was kept.
 */
export async function standDown(git) {
  await git('rebase', '--abort').catch(() => {});
  await git('merge', '--abort').catch(() => {});
  const dir = RESCUE + stamp() + '/';
  await mkdir(dir, { recursive: true });
  await cp(DATA, dir, { recursive: true }).catch(() => {});
  await git('reset', '--hard', 'origin/main').catch(() => {});
  return dir;
}
