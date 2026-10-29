// A rescue command for when a writer gets stuck: "run npm run doctor and read it to me".
//
//   npm run doctor          -> report what state this copy is in, in plain language
//   npm run doctor -- --fix -> put it back to a clean copy of GitHub, keeping unpublished work
//
// --fix is deliberately conservative: anything unpublished in src/data/inbox is copied aside
// first and put back afterwards, so the one thing a writer actually cares about survives.
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const REPO = fileURLToPath(new URL('../', import.meta.url));
const INBOX = fileURLToPath(new URL('../src/data/inbox/', import.meta.url));
const DATA = fileURLToPath(new URL('../src/data/', import.meta.url));
const fix = process.argv.includes('--fix');

const git = async (...args) => (await run('git', args, { cwd: REPO, windowsHide: true })).stdout.trim();
const tryGit = async (...args) => { try { return await git(...args); } catch { return null; } };

console.log('Top of the World — checking this copy\n');

const branch = await tryGit('rev-parse', '--abbrev-ref', 'HEAD');
if (!branch) {
  console.log("This folder isn't a GitHub copy of the project at all.");
  console.log('Ask Adam to set it up again — nothing you have written is lost, it just lives here as files.');
  process.exit(1);
}

const remote = await tryGit('remote', 'get-url', 'origin');
const dirty = (await tryGit('status', '--porcelain')) ?? '';
const inbox = (await readdir(INBOX).catch(() => [])).filter((f) => f.endsWith('.json'));
const mid = (await tryGit('rev-parse', '--git-path', 'rebase-merge')) && (await tryGit('status')) || '';
const rebasing = /rebase in progress|You are currently rebasing/i.test(mid);

console.log(`  Branch:            ${branch}${branch === 'main' ? '' : '   <-- should normally be main'}`);
console.log(`  Linked to GitHub:  ${remote ? 'yes' : 'NO — ask Adam'}`);
console.log(`  Unpublished work:  ${inbox.length} day(s) waiting in the inbox`);
console.log(`  Unsaved changes:   ${dirty ? dirty.split('\n').length + ' file(s)' : 'none'}`);
console.log(`  Stuck mid-update:  ${rebasing ? 'YES' : 'no'}`);

let ahead = await tryGit('rev-list', '--count', '@{u}..HEAD');
let behind = await tryGit('rev-list', '--count', 'HEAD..@{u}');
if (ahead !== null) console.log(`  Waiting to publish: ${ahead} change(s)`);
if (behind !== null) console.log(`  New from others:    ${behind} change(s) not yet pulled`);

const healthy = branch === 'main' && remote && !rebasing;
console.log('');

if (!fix) {
  console.log(healthy ? 'This copy looks healthy.' : 'This copy needs fixing — run:  npm run doctor -- --fix');
  if (inbox.length) console.log(`\nUnpublished days that would be kept safe by --fix:\n  ${inbox.join('\n  ')}`);
  process.exit(0);
}

// ---------- --fix ----------
console.log('Putting this copy back to a clean copy of GitHub, keeping your unpublished days...\n');

// Copy ALL of src/data aside, not just the inbox. The reset below throws away local
// commits, and a day can easily be sitting in one: a Publish that committed and then failed
// to push leaves exactly that. Losing somebody's questions to a repair command would be far
// worse than the problem being repaired.
const rescue = await mkdtemp(join(tmpdir(), 'totw-rescue-'));
await cp(DATA, rescue, { recursive: true });
console.log(`  copied everything in src/data aside, to ${rescue}`);
if (ahead && ahead !== '0') {
  console.log(`  note: ${ahead} change(s) had been saved here but never reached GitHub.`);
  console.log('        They are in that folder. Check it before deleting it.');
}

let stash = null;
if (inbox.length) {
  stash = await mkdtemp(join(tmpdir(), 'totw-inbox-'));
  await cp(INBOX, stash, { recursive: true });
  console.log(`  kept ${inbox.length} unpublished day(s) safe in ${stash}`);
}

await tryGit('rebase', '--abort');
await tryGit('merge', '--abort');
await tryGit('checkout', 'main');
await tryGit('fetch', 'origin');
await tryGit('reset', '--hard', 'origin/main');
await tryGit('clean', '-fd', '--', 'src/data');

if (stash) {
  await mkdir(INBOX, { recursive: true });
  await cp(stash, INBOX, { recursive: true });
  await rm(stash, { recursive: true, force: true });
  console.log('  put your unpublished days back');
}

console.log(`\nDone. Branch is ${await tryGit('rev-parse', '--abbrev-ref', 'HEAD')}, matching GitHub.`);
console.log('Start writing again with the Write questions icon, and press Publish when you are ready.');
console.log(`
Everything src/data held before the repair is in ${rescue} if anything looks missing.`);
