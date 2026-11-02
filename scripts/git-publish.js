// The git side of the admin's Publish button. Dev-server only; never part of the built site.
//
// The writers are not developers, so the contract here is strict: either the work is published,
// or the repository is left exactly as it was and they get a sentence they can act on. Nobody
// should ever end up staring at conflict markers or a half-finished rebase.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setAsidePublishedSets, standDown } from './publish-safety.js';

const run = promisify(execFile);
const REPO = fileURLToPath(new URL('../', import.meta.url));

const git = (...args) => run('git', args, { cwd: REPO, windowsHide: true });

/** Plain English for the handful of things that actually go wrong. */
function explain(text) {
  const t = String(text);
  if (/could not read Username|Authentication failed|Permission denied|403/i.test(t)) {
    return "GitHub didn't accept your sign-in. Your work is saved on this computer — ask Adam to check your GitHub access, then press Publish again.";
  }
  if (/Could not resolve host|unable to access|Connection timed out|network/i.test(t)) {
    return 'Can\'t reach GitHub right now. Your work is saved on this computer — check your internet and press Publish again.';
  }
  if (/no upstream|does not appear to be a git repository|No such remote/i.test(t)) {
    return "This copy isn't linked to GitHub yet. Ask Adam to finish setting it up — nothing has been lost.";
  }
  if (/cannot pull with rebase|unstaged changes|cannot rebase: You have/i.test(t)) {
    // --autostash should make this unreachable, but say something true if it ever shows up
    return 'Something else on this computer has changed files in the project. Your questions are saved — ask Adam to tidy it up (npm run doctor).';
  }
  return null;
}

const fail = (message, detail) => ({ ok: false, message, detail: String(detail ?? '').trim().slice(0, 600) });

/**
 * Commit everything under src/data, pull anyone else's work, and push.
 * Returns { ok, message, pulled } — `pulled` is how many new scheduled days arrived.
 */
export async function publish(author) {
  // --- sanity: a real repo, on a branch, with somewhere to push -------------
  let branch;
  try {
    branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
  } catch (e) {
    return fail("This folder isn't set up as a GitHub copy yet. Ask Adam to finish setting it up.", e.stderr || e.message);
  }
  if (branch === 'HEAD') {
    return fail(
      'This copy got stuck part-way through an update. Double-click "Fix my copy" in the project folder, then press Publish again — your questions are kept safe.',
      'detached HEAD'
    );
  }
  try {
    await git('remote', 'get-url', 'origin');
  } catch (e) {
    return fail("This copy isn't linked to GitHub yet. Ask Adam to finish setting it up — nothing has been lost.", e.stderr || e.message);
  }

  // --- head off the state that strands people ------------------------------
  // Anything in this copy's inbox that has already been scheduled would otherwise be
  // committed as a change to a file the remote deleted, which rebase cannot resolve.
  let alreadyLive = [];
  try {
    await git('fetch', 'origin');
    alreadyLive = await setAsidePublishedSets(git);
  } catch {
    // offline, or no remote yet; the push below reports it properly
  }

  // --- commit whatever is new under src/data -------------------------------
  try {
    await git('add', '--', 'src/data');
  } catch (e) {
    return fail('Could not save your work for publishing. Nothing has been changed.', e.stderr || e.message);
  }

  const staged = (await git('diff', '--cached', '--name-only')).stdout.trim();
  if (staged) {
    try {
      await git('commit', '-m', `Questions by ${author || 'a friend'}`);
    } catch (e) {
      return fail('Could not save your work for publishing. Nothing has been changed.', e.stderr || e.message);
    }
  }

  // Did we even have anything of our own to send?
  let ahead = '0';
  try {
    ahead = (await git('rev-list', '--count', '@{u}..HEAD')).stdout.trim();
  } catch {
    ahead = staged ? '1' : '0'; // no upstream set yet; the push below will tell us properly
  }

  // --- bring in anyone else's days -----------------------------------------
  // --autostash matters more than it looks: we only stage src/data, so anything else the
  // writer's machine has touched — npm install rewrites package-lock.json on Windows every
  // single time the launcher runs — would otherwise make rebase refuse to start, and Publish
  // would fail forever with a message blaming a conflict that doesn't exist.
  const before = await scheduledDays();
  try {
    await git('pull', '--rebase', '--autostash');
  } catch (e) {
    const known = explain(e.stderr || e.message);
    if (known) {
      await git('rebase', '--abort').catch(() => {});
      return fail(known, e.stderr || e.message);
    }
    // Two people changed the same day. There is no right answer to whose wording wins, so the
    // one already published stays — other people may have seen it — and this copy is put back
    // in step rather than left stuck. Everything written here is kept first.
    //
    // This used to leave the writer on a detached HEAD, where every later Publish hit the
    // same conflict and failed identically. Standing down is the whole point: being able to
    // carry on matters more than getting this one edit through.
    const kept = await standDown(git);
    return fail(
      'Somebody else changed the same day while you were working on it, so theirs is the one that stays. Nothing of yours was lost — it is in the rescued-questions folder. Open the day again and make your change on top of theirs.',
      `conflict; kept in ${kept}\n${e.stderr || e.message}`
    );
  }
  const pulled = (await scheduledDays()) - before;

  // --- send ours ------------------------------------------------------------
  if (ahead !== '0' || staged) {
    try {
      await git('push');
    } catch (e) {
      // Classic race: someone pushed between our pull and our push. Rebase once and retry.
      try {
        await git('pull', '--rebase', '--autostash');
        await git('push');
      } catch (e2) {
        await git('rebase', '--abort').catch(() => {});
        const known = explain(e2.stderr || e2.message);
        return fail(
          known ?? 'Could not send your questions to GitHub. They are saved on this computer, so press Publish again in a minute — send this to Adam if it keeps happening.',
          e2.stderr || e2.message
        );
      }
    }
  }

  const sent = ahead !== '0' || staged;
  const live =
    alreadyLive.length === 0
      ? ''
      : ` ${alreadyLive.length === 1 ? 'One day you had here was' : `${alreadyLive.length} days you had here were`}` +
        ` already published (Day ${alreadyLive.join(', Day ')}), so ${alreadyLive.length === 1 ? 'it was' : 'they were'} tidied away.`;
  return {
    ok: true,
    pulled,
    sent,
    alreadyLive,
    message:
      (sent ? 'Published. Your day is on its way.' : 'Nothing new of yours to publish.') +
      (pulled > 0 ? ` Picked up ${pulled} new day${pulled === 1 ? '' : 's'} from everyone else.` : '') +
      live,
  };
}

async function scheduledDays() {
  const { readdir } = await import('node:fs/promises');
  try {
    return (await readdir(new URL('../src/data/days/', import.meta.url))).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}
