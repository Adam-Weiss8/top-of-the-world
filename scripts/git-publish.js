// The git side of the admin's Publish button. Dev-server only; never part of the built site.
//
// The writers are not developers, so the contract here is strict: either the work is published,
// or the repository is left exactly as it was and they get a sentence they can act on. Nobody
// should ever end up staring at conflict markers or a half-finished rebase.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

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
    return fail('This copy is in an odd state that needs Adam to sort out. Nothing has been changed.', 'detached HEAD');
  }
  try {
    await git('remote', 'get-url', 'origin');
  } catch (e) {
    return fail("This copy isn't linked to GitHub yet. Ask Adam to finish setting it up — nothing has been lost.", e.stderr || e.message);
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
  const before = await scheduledDays();
  try {
    await git('pull', '--rebase');
  } catch (e) {
    // The one path that could strand them. Put everything back exactly as it was.
    await git('rebase', '--abort').catch(() => {});
    const known = explain(e.stderr || e.message);
    if (known) return fail(known, e.stderr || e.message);
    return fail(
      'Someone else changed the same day at the same time. Nothing on your computer has been changed, and your questions are safe — send this to Adam.',
      e.stderr || e.message
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
        await git('pull', '--rebase');
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
  return {
    ok: true,
    pulled,
    sent,
    message:
      (sent ? 'Published. Your day is on its way.' : 'Nothing new of yours to publish.') +
      (pulled > 0 ? ` Picked up ${pulled} new day${pulled === 1 ? '' : 's'} from everyone else.` : ''),
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
