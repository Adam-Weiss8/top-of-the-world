import './style.css';
import { createMap, countryName } from './map.js';
import { createJourney } from './journey.js';
import { kmFor, formatAltitude, landmarkReached, travellerFor, START_EMOJI } from './landmarks.js';
import { rankingOf } from './questions.js';
import { track } from './analytics.js';
import { dayDate } from './queue.js';
import {
  todayKey,
  puzzleNumber,
  puzzleFor,
  score,
  tier,
  TIER_EMOJI,
  QUESTIONS_PER_DAY,
  MAX_TOTAL,
} from './daily.js';

const $ = (id) => document.getElementById(id);

// In dev, ?day=N previews a queued day and ?set=<id> previews one that hasn't been scheduled
// yet (both from the admin page), neither of which touches saved progress.
const params = import.meta.env.DEV ? new URLSearchParams(location.search) : new URLSearchParams();
const preview = params.get('day');
const previewSet = params.get('set');
const key = preview !== null ? dayDate(Number(preview)) : todayKey();
const number = puzzleNumber(key);
let { questions, author } = puzzleFor(key);
const storageKey = preview !== null || previewSet ? null : `totw2:${key}`;
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

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const restartAnimation = (el, cls) => {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
};

let unlockTimer;
let settleTimer;

/**
 * Show the next question with a little ceremony: the map dims, the card's lines fade in,
 * the prompt arrives word by word, then the pick bar. Picking unlocks once it's all read.
 */
function showQuestion() {
  const i = answers.length;
  current = null;
  map.reset();
  map.lock();
  const words = questions[i].prompt.split(/\s+/);
  $('question-number').textContent = `Question ${i + 1} of ${QUESTIONS_PER_DAY}`;
  $('question-text').innerHTML = words.map((w, k) => `<span class="word" style="--i:${k}">${esc(w)}</span>`).join(' ');
  $('pick-label').textContent = 'Tap a country to plant your flag';
  $('confirm').disabled = true;
  $('question-card').hidden = false;
  $('pick-bar').hidden = false;
  $('journey-screen').hidden = true;
  renderStatus();

  const revealMs = reducedMotion() ? 0 : 900 + words.length * 90;
  const stage = document.querySelector('.stage');
  stage.style.setProperty('--reveal-ms', `${revealMs}ms`);
  restartAnimation($('question-card'), 'revealing');
  restartAnimation($('pick-bar'), 'revealing');
  restartAnimation(stage, 'question-intro');
  clearTimeout(unlockTimer);
  clearTimeout(settleTimer);
  unlockTimer = setTimeout(() => map.unlock(), revealMs);
  // Then drop `revealing`, so nothing is left holding a finished animation: a word that keeps
  // its blur keyframes stays fuzzy on iOS, where the blurred raster is never redrawn. The last
  // word lands just after revealMs and the pick bar finishes its 0.4s fade after that.
  settleTimer = setTimeout(() => {
    $('question-card').classList.remove('revealing');
    $('pick-bar').classList.remove('revealing');
  }, revealMs + 520);
}

async function confirmPick() {
  if (!current || $('confirm').disabled) return;
  $('confirm').disabled = true;
  const q = questions[answers.length];
  const code = current;
  const { points, rank } = score(q, code);
  const before = total();
  answers.push({ code, points, rank });
  save();
  if (answers.length === QUESTIONS_PER_DAY) track('finished', 'Finished all five');
  map.lock();
  $('question-card').hidden = true;
  $('pick-bar').hidden = true;
  renderStatus(before);
  await revealScore(code, points);
  playJourney(before, total(), {
    points,
    next: answers.length === QUESTIONS_PER_DAY ? 'See your recap' : 'Next question',
  });
}

// ---------- score reveal ----------
// Between confirming and the journey: the map glides to the pick, a drumroll, then the
// points slam in. Shake, glow and sparkle all scale with how close the answer was.

const REVEAL_FX = {
  gold: { color: '#f6c21b', glow: 1, shake: 16, sparkles: 16, label: 'Perfect!' },
  purple: { color: '#b48ef0', glow: 0.7, shake: 9, sparkles: 9, label: 'So close!' },
  blue: { color: '#5cb2ff', glow: 0.45, shake: 4, sparkles: 4, label: 'Nice climb' },
  green: { color: '#6ee7a0', glow: 0.25, shake: 1.5, sparkles: 0, label: 'On the list' },
  // A miss holds longer so the toppling-rocket scene can play out.
  grey: { color: '#b8c3c9', glow: 0, shake: 0, sparkles: 0, label: 'Off the list', hold: 3300 },
};
const DRUMROLL_MS = 1400;
const COUNT_MS = 450;
const HOLD_MS = 1700;

function revealScore(code, points) {
  const t = tier(points);
  const fx = REVEAL_FX[t];
  const el = $('score-reveal');
  const stage = document.querySelector('.stage');
  map.spotlight(code, { color: fx.color, strength: fx.glow });

  el.className = `score-reveal ${t} drumroll`;
  el.style.setProperty('--glow-color', fx.color);
  el.style.setProperty('--glow', fx.glow);
  el.hidden = false;
  $('sr-country').textContent = countryName(code);
  $('sr-points').textContent = '';
  $('sr-label').textContent = '';
  $('sr-sparkles').innerHTML = '';

  return new Promise((resolve) => {
    const timers = [];
    let stage2 = false;
    let done = false;
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));

    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      el.removeEventListener('click', onTap);
      el.classList.add('leaving');
      setTimeout(() => {
        el.hidden = true;
        stage.classList.remove('shake');
        resolve();
      }, 250);
    };

    const slam = () => {
      if (stage2) return;
      stage2 = true;
      timers.forEach(clearTimeout);
      el.classList.remove('drumroll');
      el.classList.add('counting');
      const start = performance.now();
      const count = (now) => {
        const k = reducedMotion() ? 1 : Math.min(1, (now - start) / COUNT_MS);
        $('sr-points').textContent = `+${Math.round(points * k)}`;
        if (k < 1) return requestAnimationFrame(count);
        el.classList.add('slammed');
        $('sr-label').textContent = fx.label;
        $('sr-sparkles').innerHTML = Array.from({ length: fx.sparkles }, (_, k) => {
          const angle = (k / fx.sparkles) * Math.PI * 2 + Math.random() * 0.4;
          const dist = 90 + Math.random() * 90;
          return `<span style="--dx:${(Math.cos(angle) * dist).toFixed(0)}px;--dy:${(Math.sin(angle) * dist).toFixed(0)}px;--d:${(Math.random() * 0.15).toFixed(2)}s">✦</span>`;
        }).join('');
        if (fx.shake && !reducedMotion()) {
          stage.style.setProperty('--shake', `${fx.shake}px`);
          restartAnimation(stage, 'shake');
        }
        later(fx.hold ?? HOLD_MS, finish);
      };
      requestAnimationFrame(count);
    };

    // Tap to hurry: during the drumroll it jumps to the slam; after it, it moves on.
    const onTap = () => (stage2 ? finish() : slam());
    el.addEventListener('click', onTap);
    later(reducedMotion() ? 200 : DRUMROLL_MS, slam);
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
  setSheet('middle', { refit: false });
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

  map.reveal(ranking, a.code, mapPadding());
}

$('tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) showTab(Number(tab.dataset.i));
});

// ---------- recap sheet (phones) ----------
// On phones the recap is a bottom sheet that snaps between collapsed (map almost
// fullscreen), middle, and expanded (recap fullscreen). Drag or flick the handle/header,
// or tap the handle to cycle. On wider screens it stays a side panel.

const phone = matchMedia('(max-width: 720px)');
const SHEET_ORDER = ['collapsed', 'middle', 'expanded'];
let sheet = 'middle';

function sheetPx(state) {
  const stageHeight = $('map').clientHeight;
  if (state === 'expanded') return stageHeight;
  if (state === 'middle') {
    // Never shorter than the whole header plus the tabs: a two-line title ("You landed on the
    // Moon!") would otherwise leave the share button half-clipped on the sheet's edge.
    const head =
      $('recap-handle').offsetHeight +
      $('recap').querySelector('.recap-head').offsetHeight +
      $('tabs').offsetHeight;
    return Math.min(stageHeight, Math.max(Math.round(stageHeight * 0.6), head));
  }
  // Collapsed: just the handle, the date line and the result title.
  return $('recap').querySelector('.recap-score').offsetTop + 2;
}

/** Map padding for the space the recap covers (at its resting size, not mid-animation). */
function mapPadding() {
  if (phone.matches) return { bottom: sheet === 'expanded' ? 0 : sheetPx(sheet) };
  const panel = $('recap').getBoundingClientRect();
  return { right: $('map').getBoundingClientRect().right - panel.left };
}

function setSheet(state, { refit = true, animate = true } = {}) {
  const recap = $('recap');
  if (!phone.matches) {
    recap.style.height = '';
    delete recap.dataset.sheet;
    return;
  }
  sheet = state;
  recap.dataset.sheet = state;
  // `dragging` switches the height transition off. Without it a resize-driven change animates,
  // so the header — and the share button in it — slides every time the viewport twitches.
  if (!animate) recap.classList.add('dragging');
  recap.style.height = `${sheetPx(state)}px`;
  if (!animate) {
    void recap.offsetHeight; // commit the new height before transitions come back
    recap.classList.remove('dragging');
  }
  if (refit && state !== 'expanded') map.refit(mapPadding());
}

const nextSheet = { collapsed: 'middle', middle: 'expanded', expanded: 'collapsed' };
let drag = null;

$('recap').addEventListener('pointerdown', (e) => {
  if (!phone.matches || !e.target.closest('.sheet-handle, .recap-head') || e.target.closest('button')) return;
  const now = performance.now();
  drag = { startY: e.clientY, startH: $('recap').offsetHeight, lastY: e.clientY, lastT: now, v: 0, moved: 0 };
  $('recap').classList.add('dragging');
  $('recap').setPointerCapture(e.pointerId);
});

$('recap').addEventListener('pointermove', (e) => {
  if (!drag) return;
  const now = performance.now();
  // Rounded: touch coordinates are fractional, and a sheet resting on half a pixel makes the
  // share button's outlined shape re-rasterise and shimmer.
  const h = Math.round(
    Math.max(sheetPx('collapsed'), Math.min(sheetPx('expanded'), drag.startH + drag.startY - e.clientY))
  );
  $('recap').style.height = `${h}px`;
  drag.v = (drag.lastY - e.clientY) / Math.max(1, now - drag.lastT); // px/ms, positive = upward
  drag.lastY = e.clientY;
  drag.lastT = now;
  drag.moved = Math.max(drag.moved, Math.abs(e.clientY - drag.startY));
});

function endDrag() {
  if (!drag) return;
  const { moved, v } = drag;
  drag = null;
  const recap = $('recap');
  recap.classList.remove('dragging');
  if (moved < 6) return setSheet(nextSheet[sheet]); // a tap cycles
  const h = recap.offsetHeight;
  const sizes = SHEET_ORDER.map((s) => [s, sheetPx(s)]);
  let target;
  if (Math.abs(v) > 0.5) {
    // A flick goes to the next size in that direction.
    target = v > 0 ? sizes.find(([, px]) => px > h + 1) : [...sizes].reverse().find(([, px]) => px < h - 1);
  }
  target ??= sizes.reduce((best, s) => (Math.abs(s[1] - h) < Math.abs(best[1] - h) ? s : best));
  setSheet(target[0]);
}
$('recap').addEventListener('pointerup', endDrag);
$('recap').addEventListener('pointercancel', endDrag);

$('recap-handle').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    setSheet(nextSheet[sheet]);
  }
});

phone.addEventListener('change', () => !$('recap').hidden && setSheet(sheet));

// iOS Safari fires resize as its URL bar collapses, often without the stage changing at all.
// Re-setting the height on every one of those jitters the sheet, so only react to a real
// change in size, and never mid-drag.
let lastStageHeight = 0;
window.addEventListener('resize', () => {
  if ($('recap').hidden || drag) return;
  const height = $('map').clientHeight;
  if (height === lastStageHeight) return;
  lastStageHeight = height;
  setSheet(sheet, { refit: false, animate: false });
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
  track('started', 'Started a climb');
  showQuestion();
});

$('climb-label').textContent = `Climb #${number} · ${dateLabel}`;
for (const id of ['intro-byline', 'recap-byline']) {
  $(id).textContent = author ? `Today’s questions by ${author}` : '';
  $(id).hidden = !author;
}
renderStatus();

map.ready.then(async () => {
  // Previewing an unscheduled set: swap its questions in before anything is drawn. Dev only —
  // /api/inbox exists solely on the dev server.
  if (previewSet) {
    try {
      const set = (await fetch('/api/inbox').then((r) => r.json())).find((s) => s.id === previewSet);
      if (set?.questions?.length) {
        questions = set.questions;
        author = set.author ?? null;
        for (const id of ['intro-byline', 'recap-byline']) {
          $(id).textContent = author ? `Today’s questions by ${author}` : '';
          $(id).hidden = !author;
        }
        renderStatus();
      }
    } catch {
      // not running against the dev server; fall through to the real puzzle
    }
  }
  if (answers.length >= QUESTIONS_PER_DAY) {
    showRecap();
  } else if (answers.length > 0) {
    showQuestion();
  } else {
    $('intro-number').textContent = `Climb #${number} · ${dateLabel}`;
    $('intro').hidden = false;
  }
});
