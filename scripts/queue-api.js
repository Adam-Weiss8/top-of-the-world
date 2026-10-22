// Dev-server API behind the admin page. It only exists while `npm run dev` runs and is
// never part of the built site.
//
//   GET    /api/days      -> [day, …]  (every src/data/days/day_N.json)
//   PUT    /api/days/:n   -> write day n (body: the day JSON)
//   DELETE /api/days/:n   -> remove day n

import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fileName, formatDay, QUESTIONS_PER_DAY } from '../src/queue.js';

const DIR = fileURLToPath(new URL('../src/data/days/', import.meta.url));

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
  if (day?.day !== n) return `day number should be ${n}`;
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
    },
  };
}
