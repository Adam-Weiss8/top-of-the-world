// Dev-server API behind the admin page. It only exists while `npm run dev` runs and is
// never part of the built site.
//
//   GET    /api/days       -> [day, …]  (every src/data/days/day_N.json)
//   PUT    /api/days/:n    -> write day n (body: the day JSON)
//   DELETE /api/days/:n    -> remove day n
//   GET    /api/inbox      -> [set, …]  (unscheduled sets, each with an id)
//   PUT    /api/inbox/:id  -> write a set (body: { created, author, questions })
//   DELETE /api/inbox/:id  -> remove a set
//   POST   /api/publish    -> commit, pull and push everything under src/data
//
// A set in the inbox has no day number: it gets one when it lands on main (scripts/queue-days.mjs).
// That's what lets two people write at the same time — their filenames can't collide, so their
// pushes can't conflict.

import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fileName, formatDay, QUESTIONS_PER_DAY } from '../src/queue.js';
import { publish } from './git-publish.js';

const DIR = fileURLToPath(new URL('../src/data/days/', import.meta.url));
const INBOX = fileURLToPath(new URL('../src/data/inbox/', import.meta.url));
const ID = /^\d{8}T\d{6}-[a-z0-9-]{1,24}$/;

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

// A saved day may be a draft (short lists, empty prompts), but it must have the right
// shape and only real-looking codes, so the game can always load it safely.
function checkShape(day, n) {
  if (n !== null && day?.day !== n) return `day number should be ${n}`;
  if (day.author !== undefined && (typeof day.author !== 'string' || day.author.length > 60)) return 'bad author name';
  if (!Array.isArray(day.questions) || day.questions.length !== QUESTIONS_PER_DAY) return 'needs 5 questions';
  for (const q of day.questions) {
    if (typeof q.prompt !== 'string' || typeof q.source !== 'string' || !Array.isArray(q.ranking)) return 'bad question';
    if (q.ranking.some((e) => !Array.isArray(e) || !/^[A-Z]{3}$/.test(e[0]))) return 'every answer needs a country';
  }
  return null;
}

export function queueApi() {
  return {
    name: 'question-queue-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/days', async (req, res) => {
        try {
          await mkdir(DIR, { recursive: true });
          const n = Number(req.url.replace(/^\//, '').split('?')[0]);

          if (req.method === 'GET') {
            const files = (await readdir(DIR)).filter((f) => /^day_-?\d+\.json$/.test(f));
            const days = await Promise.all(files.map(async (f) => JSON.parse(await readFile(DIR + f, 'utf8'))));
            return send(res, 200, days.sort((a, b) => a.day - b.day));
          }
          if (!Number.isInteger(n) || req.url === '/') return send(res, 400, { error: 'which day?' });

          if (req.method === 'PUT') {
            const day = JSON.parse(await readBody(req));
            const problem = checkShape(day, n);
            if (problem) return send(res, 400, { error: problem });
            await writeFile(DIR + fileName(n), formatDay(day));
            return send(res, 200, { ok: true });
          }
          if (req.method === 'DELETE') {
            await unlink(DIR + fileName(n)).catch(() => {});
            return send(res, 200, { ok: true });
          }
          send(res, 405, { error: 'method not allowed' });
        } catch (e) {
          send(res, 500, { error: e.message });
        }
      });

      // ---------- unscheduled sets ----------
      server.middlewares.use('/api/inbox', async (req, res) => {
        try {
          await mkdir(INBOX, { recursive: true });
          const id = req.url.replace(/^\//, '').split('?')[0];

          if (req.method === 'GET' && !id) {
            const files = (await readdir(INBOX)).filter((f) => f.endsWith('.json')).sort();
            const sets = await Promise.all(
              files.map(async (f) => ({ id: f.replace(/\.json$/, ''), ...JSON.parse(await readFile(INBOX + f, 'utf8')) }))
            );
            return send(res, 200, sets);
          }
          if (!ID.test(id)) return send(res, 400, { error: 'bad set id' });

          if (req.method === 'PUT') {
            const set = JSON.parse(await readBody(req));
            const problem = checkShape(set, null);
            if (problem) return send(res, 400, { error: problem });
            const { created, author, questions } = set;
            await writeFile(INBOX + id + '.json', JSON.stringify({ created, author, questions }, null, 2) + '\n');
            return send(res, 200, { ok: true });
          }
          if (req.method === 'DELETE') {
            await unlink(INBOX + id + '.json').catch(() => {});
            return send(res, 200, { ok: true });
          }
          send(res, 405, { error: 'method not allowed' });
        } catch (e) {
          send(res, 500, { error: e.message });
        }
      });

      // ---------- publish ----------
      server.middlewares.use('/api/publish', async (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
        try {
          const { author } = JSON.parse((await readBody(req)) || '{}');
          send(res, 200, await publish(author));
        } catch (e) {
          send(res, 200, {
            ok: false,
            message: 'Something went wrong and nothing was changed. Send this to Adam.',
            detail: e.message,
          });
        }
      });
    },
  };
}
