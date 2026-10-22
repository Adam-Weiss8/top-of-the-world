import './style.css';
import { createMap, countryName } from './map.js';
import { createJourney } from './journey.js';
import { kmFor, formatAltitude, landmarkReached, travellerFor, START_EMOJI } from './landmarks.js';
import { rankingOf } from './questions.js';
import { dayDate } from './queue.js';
import {
  todayKey,
  puzzleNumber,
  questionsFor,
  score,
  tier,
  TIER_EMOJI,
  QUESTIONS_PER_DAY,
  MAX_TOTAL,
} from './daily.js';

const $ = (id) => document.getElementById(id);

// In dev, ?day=N previews any queued day (from the admin page) without saving progress.
const preview = import.meta.env.DEV ? new URLSearchParams(location.search).get('day') : null;
const key = preview !== null ? dayDate(Number(preview)) : todayKey();
const number = puzzleNumber(key);
const questions = questionsFor(key);
const storageKey = preview !== null ? null : `totw2:${key}`;
const dateLabel = new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// answers: [{ code, points, rank }], one per question answered so far
let answers = load();
let current = null; // the country currently pinned, before confirming
let recapTab = 0;

const map = createMap($('map'), {
  onPick({ code, name }) {
    current = code;
    $('pick-label').innerHTML = `<span class="pin-tag">Pin</span> <strong>${name}</strong>`;
    $('confirm').disabled = false;
  },
});
const journey = createJourney($('journey'));
if (import.meta.env.DEV) window.totw = { map, journey };
createJourney($('intro-scene'), { mode: 'poster' }).jumpTo(0);

function load() {
  if (!storageKey) return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey)) ?? [];
  } catch {
    return [];
  }
}

function save() {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(answers));
  } catch {
    // Private mode etc. The game still works, it just won't survive a reload.
  }
}

const total = () => answers.reduce((sum, a) => sum + a.points, 0);
const altitude = (points) => formatAltitude(kmFor(points));

// ---------- top bar ----------

function renderStatus(points = total()) {
  $('dots').innerHTML = questions
    .map((_, i) => {
      const a = answers[i];
      const cls = a ? tier(a.points) : i === answers.length ? 'current' : '';
      return `<li class="dot ${cls}"></li>`;
    })
    .join('');
  $('altitude-readout').textContent = altitude(points);
}

// ---------- question ----------

function showQuestion() {
  const i = answers.length;
  current = null;
  map.reset();
  $('question-number').textContent = `Question ${i + 1} of ${QUESTIONS_PER_DAY}`;
  $('question-text').textContent = questions[i].prompt;
  $('pick-label').textContent = 'Tap a country to plant your flag';
  $('confirm').disabled = true;
  $('question-card').hidden = false;
  $('pick-bar').hidden = false;
  $('journey-screen').hidden = true;
  renderStatus();
}

function confirmPick() {
  if (!current) return;
  const q = questions[answers.length];
  const { points, rank } = score(q, current);
  const before = total();
  answers.push({ code: current, points, rank });
  save();
  map.lock();
  $('question-card').hidden = true;
  $('pick-bar').hidden = true;
  renderStatus(before);
  playJourney(before, total(), {
    points,
    next: answers.length === QUESTIONS_PER_DAY ? 'See your recap' : 'Next question',
  });
}

// ---------- journey ----------

let afterJourney = () => {};

/** Full-screen climb from `from` to `to` points. Ranks stay secret; only points show. */
function playJourney(from, to, { points = null, next }) {
  const screen = $('journey-screen');
  screen.hidden = false;
  screen.classList.add('playing');
  $('journey-next').textContent = next;
  $('hud-points').textContent = points === null ? '' : `+${points}`;
  $('hud-points').className = `hud-points ${points === null ? '' : tier(points)}`;
  $('hud-landmark').textContent = '';
  $('hud-landmark').className = 'hud-landmark';
  $('skip-hint').textContent = 'Tap to skip';

  let shown = landmarkReached(from);
  const onProgress = (p) => {
    $('hud-altitude').textContent = altitude(p);
    $('altitude-readout').textContent = altitude(p);
    const reached = landmarkReached(p);
    if (reached && reached !== shown && reached.points > from) {
      shown = reached;
      const el = $('hud-landmark');
      el.textContent = reached.km >= 384_400 ? '🌕 You landed on the Moon!' : `Passing: ${reached.emoji} ${reached.name}`;
      el.className = 'hud-landmark';
      void el.offsetWidth; // restart the pop animation
      el.className = 'hud-landmark pop';
    }
  };
  onProgress(from);
  journey.play(from, to, { onProgress }).then(() => {
    screen.classList.remove('playing');
    $('skip-hint').textContent = to > 40 ? 'Scroll down to look back ▾' : '';
    renderStatus(to);
  });
}

$('journey-screen').addEventListener('click', (e) => {
  if (e.target.closest('#journey-next')) return;
  journey.skip();
});

$('journey-next').addEventListener('click', () => {
  journey.skip();
  $('journey-screen').hidden = true;
  afterJourney();
});

// ---------- recap ----------

function recapTitle(points) {
  const who = travellerFor(points);
  if (who === 'astronaut') return 'You landed on the Moon!';
  if (points >= 600) return 'You made it to orbit!';
  if (points >= 466) return 'You reached space!';
  if (who === 'rocket') return 'Lift-off!';
  if (who === 'balloon') return 'Above the clouds';
  return points >= 120 ? 'A solid climb' : 'Still in the foothills';
}

function showRecap() {
  const points = total();
  const reached = landmarkReached(points);
  $('question-card').hidden = true;
  $('pick-bar').hidden = true;
  $('journey-screen').hidden = true;
  $('recap').hidden = false;
  $('recap-number').textContent = `Climb #${number} · ${dateLabel}`;
  $('recap-title').textContent = recapTitle(points);
  $('recap-points').textContent = `${points} / ${MAX_TOTAL}`;
  $('recap-altitude').textContent = `${altitude(points)}${reached ? ` · ${reached.emoji} ${reached.name}` : ''}`;
  $('tabs').innerHTML = questions
    .map(
      (_, i) =>
        `<button role="tab" class="tab" data-i="${i}"><span class="dot ${tier(answers[i].points)}"></span>Q${i + 1}</button>`
    )
    .join('');
  renderStatus();
  tickCountdown();
  showTab(recapTab);
}

function showTab(i) {
  recapTab = i;
  const q = questions[i];
  const a = answers[i];
  const ranking = rankingOf(q);
  for (const tab of $('tabs').children) tab.setAttribute('aria-selected', String(Number(tab.dataset.i) === i));

  $('recap-question').innerHTML = `<span>Click the country</span> ${q.prompt}`;
  const picked = countryName(a.code);
  $('recap-you').innerHTML = a.rank
    ? `You picked <strong>${picked}</strong> · #${a.rank} of ${ranking.length} · <b class="pts ${tier(a.points)}">+${a.points}</b>`
    : `You picked <strong>${picked}</strong> · not on the list · <b class="pts grey">+0</b>`;
  $('ranking').innerHTML = ranking
    .map(
      (r) =>
        `<li class="${r.code === a.code ? 'you' : ''}"><span class="rank">${r.rank}</span>` +
        `<span class="name">${countryName(r.code)}</span><span class="value">${r.value}</span></li>`
    )
    .join('');
  $('source').textContent = `Source: ${q.source}`;
  $('recap').querySelector('.recap-body').scrollTop = 0;

  // Keep the peaks visible beside (desktop) or above (mobile) the recap panel.
  const panel = $('recap').getBoundingClientRect();
  const stage = $('map').getBoundingClientRect();
  const sideways = panel.top - stage.top < 40;
  map.reveal(ranking, a.code, sideways ? { right: stage.right - panel.left } : { bottom: stage.bottom - panel.top });
}

$('tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) showTab(Number(tab.dataset.i));
});

$('replay').addEventListener('click', () => {
  $('recap').hidden = true;
  afterJourney = showRecap;
  playJourney(0, total(), { next: 'Back to recap' });
});

// ---------- sharing ----------

function shareText() {
  const points = total();
  const reached = landmarkReached(points);
  return [
    `Top of the World · Climb #${number}`,
    answers.map((a) => TIER_EMOJI[tier(a.points)]).join(''),
    `${points}/${MAX_TOTAL} · ${reached?.emoji ?? START_EMOJI} ${altitude(points)}${reached ? ` · ${reached.name}` : ''}`,
    shareLink(),
  ].join('\n');
}

/**
 * The link line for shared results. No https://, because iMessage splits full URLs into a
 * separate preview bubble; but a bare "topoftheworld.fun" isn't recognised as a link (.fun
 * isn't a TLD it knows), whereas a www. prefix always is. www redirects to the bare domain.
 */
function shareLink() {
  const host = location.host.replace(/^www\./, '');
  const path = location.pathname.replace(/\/$/, '');
  return host === 'topoftheworld.fun' ? `www.${host}${path}` : `${host}${path}`;
}

async function share() {
  const text = shareText();
  // Phones: the system share sheet. Closing it without sharing isn't an error.
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  if (await copyText(text)) toast('Copied to clipboard');
  else window.prompt('Copy your result:', text); // last resort: let them copy it by hand
}

/** Copy via the Clipboard API, falling back to the older execCommand route. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand?.('copy') ?? false;
    area.remove();
    return ok;
  }
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

let countdownTimer;
function tickCountdown() {
  clearTimeout(countdownTimer);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (todayKey(now) !== key) {
    $('countdown').innerHTML = 'A new climb is ready — <a href="">start it</a>';
    return;
  }
  const s = Math.floor((midnight - now) / 1000);
  const hms = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0'));
  $('countdown').textContent = `Next climb in ${hms.join(':')}`;
  countdownTimer = setTimeout(tickCountdown, 1000);
}

// ---------- wiring ----------

afterJourney = () => (answers.length < QUESTIONS_PER_DAY ? showQuestion() : showRecap());
const nextStep = afterJourney;

$('confirm').addEventListener('click', () => {
  afterJourney = nextStep;
  confirmPick();
});
$('share').addEventListener('click', share);
$('start').addEventListener('click', () => {
  $('intro').hidden = true;
  showQuestion();
});

$('climb-label').textContent = `Climb #${number} · ${dateLabel}`;
renderStatus();

map.ready.then(() => {
  if (answers.length >= QUESTIONS_PER_DAY) {
    showRecap();
  } else if (answers.length > 0) {
    showQuestion();
  } else {
    $('intro-number').textContent = `Climb #${number} · ${dateLabel}`;
    $('intro').hidden = false;
  }
});
