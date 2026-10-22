// The question-queue admin page (dev server only): edit a day's five questions, paste
// ranked tables, and save them into src/data/days/ through the API in scripts/queue-api.js.

import './admin.css';
import { dayDate, dayNumber, validateDay, QUESTIONS_PER_DAY, MIN_ANSWERS, MAX_ANSWERS } from '../queue.js';
import { parseTable, matchCountry, normalize, COUNTRY_NAMES } from './match.js';

const $ = (id) => document.getElementById(id);
const CODES = new Set(Object.keys(COUNTRY_NAMES));
const LEVELS = ['easiest', 'easy', 'medium', 'hard', 'hardest'];
const WARN_DAYS = 7;

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = dayNumber(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
const fmtDate = (n, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${dayDate(n)}T12:00:00`).toLocaleDateString('en-GB', opts);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let days = new Map(); // saved days from disk
let selected = null; // day number being edited
let draft = null; // editable copy: { day, author, questions: [{ prompt, source, rows: [{ code, raw, value, tie }], note }] }
let dirty = false;

// Each person's name is remembered on their own computer and pre-filled on new days.
const AUTHOR_KEY = 'totw-admin-author';
const rememberedAuthor = () => {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? '';
  } catch {
    return '';
  }
};
const rememberAuthor = (name) => {
  try {
    localStorage.setItem(AUTHOR_KEY, name);
  } catch {
    // Private mode: they'll just retype it.
  }
};

// ---------- draft <-> file format ----------

function toDraft(day, n) {
  return {
    day: n,
    author: day ? (day.author ?? '') : rememberedAuthor(),
    questions: Array.from({ length: QUESTIONS_PER_DAY }, (_, i) => {
      const q = day?.questions?.[i];
      const ranks = (q?.ranking ?? []).map(([, , rank], j) => rank ?? j + 1);
      return {
        prompt: q?.prompt ?? '',
        source: q?.source ?? '',
        rows: (q?.ranking ?? []).map(([code, value], j) => ({
          code,
          raw: COUNTRY_NAMES[code] ?? code,
          value: value ?? '',
          tie: j > 0 && ranks[j] === ranks[j - 1],
        })),
        note: '',
      };
    }),
  };
}

const ranksOf = (rows) => rows.reduce((acc, r, i) => [...acc, r.tie && i > 0 ? acc[i - 1] : i + 1], []);

function fromDraft(d, { matchedOnly = false } = {}) {
  return {
    day: d.day,
    ...(d.author.trim() ? { author: d.author.trim() } : {}),
    questions: d.questions.map((q, i) => {
      const rows = matchedOnly ? q.rows.filter((r) => r.code) : q.rows;
      const ranks = ranksOf(rows);
      return {
        level: i + 1,
        prompt: q.prompt.trim(),
        source: q.source.trim(),
        ranking: rows.map((r, j) => (ranks[j] === j + 1 ? [r.code, r.value.trim()] : [r.code, r.value.trim(), ranks[j]])),
      };
    }),
  };
}

const statusOf = (n) => {
  if (!days.has(n)) return 'missing';
  return validateDay(days.get(n), CODES).ok ? 'ready' : 'draft';
};

// ---------- summary + sidebar ----------

function renderSummary() {
  let ready = 0;
  while (statusOf(today + 1 + ready) === 'ready') ready++;
  const todayNote =
    statusOf(today) === 'ready' ? '' : '<span class="warn">Today has no ready day, so players get the archive mix.</span>';
  const last = today + ready;
  const queueNote = ready
    ? `<b>${ready} day${ready === 1 ? '' : 's'}</b> queued, through Day ${last} (${fmtDate(last)})`
    : '<b>Nothing queued</b> after today';
  $('summary').innerHTML =
    `<span>Today is <b>Day ${today}</b> · ${fmtDate(today)}</span><span class="${ready < WARN_DAYS ? 'warn' : 'good'}">${
      ready < WARN_DAYS ? '⚠ ' : '✓ '
    }${queueNote}</span>${todayNote}`;
}

function renderSidebar() {
  if ($('search').value.trim()) return renderSearch();
  const nums = [...days.keys()];
  const max = Math.max(today, ...nums);
  const min = Math.min(today, ...nums);
  const item = (n) => {
    const s = statusOf(n);
    const label = { ready: '✓ ready', draft: '✎ draft', missing: '— empty' }[s];
    return `<button class="a-day ${s} ${n === selected ? 'selected' : ''} ${n === today ? 'today' : ''}" data-day="${n}">
      <span class="a-day-num">Day ${n}</span><span class="a-day-date">${fmtDate(n)}</span>
      <span class="a-day-status">${n === today ? 'today · ' : ''}${label}${
        days.get(n)?.author ? ` · ${esc(days.get(n).author)}` : ''
      }</span></button>`;
  };
  const upcoming = [];
  for (let n = today + 1; n <= max; n++) upcoming.push(item(n));
  const archive = [];
  for (let n = today - 1; n >= min; n--) if (days.has(n)) archive.push(item(n));
  const next = max + 1;
  $('days').innerHTML = `
    <h2>Upcoming</h2>
    ${upcoming.join('') || '<p class="a-empty">Nothing queued yet.</p>'}
    <button class="a-add" data-day="${next}">+ Queue Day ${next} <span>${fmtDate(next)}</span></button>
    <h2>Today</h2>${item(today)}
    <h2>Archive</h2>${archive.join('') || '<p class="a-empty">No past days.</p>'}`;
}

// ---------- search ----------
// Finds saved questions whose prompt contains every typed word (accents and case ignored),
// so whoever's writing can check an idea hasn't been done. Shows prompts, not answers.

const escRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function renderSearch() {
  const query = $('search').value.trim();
  const terms = normalize(query).split(' ').filter(Boolean);
  const results = [];
  for (const day of [...days.values()].sort((a, b) => b.day - a.day)) {
    day.questions.forEach((q, i) => {
      if (!q.prompt) return;
      const text = normalize(q.prompt);
      if (terms.every((t) => text.includes(t))) results.push({ day, q, i });
    });
  }

  // Highlight each typed word in the original prompt (case-insensitive).
  const words = query.split(/\s+/).filter(Boolean).map(escRegex);
  const highlight = (s) =>
    words.length ? esc(s).replace(new RegExp(`(${words.join('|')})`, 'gi'), '<mark>$1</mark>') : esc(s);

  const when = (n) => (n === today ? 'today' : n > today ? 'upcoming' : 'played');
  $('days').innerHTML = `
    <h2>${results.length} question${results.length === 1 ? '' : 's'} match</h2>
    ${
      results
        .map(
          ({ day, q, i }) => `
      <button class="a-result" data-day="${day.day}">
        <span class="a-result-q"><em>Click the country</em> ${highlight(q.prompt)}</span>
        <span class="a-result-meta">Climb #${day.day} · ${fmtDate(day.day, { day: 'numeric', month: 'short', year: 'numeric' })} · Q${i + 1} (level ${i + 1})</span>
        <span class="a-result-meta">${when(day.day)}${day.author ? ` · by ${esc(day.author)}` : ''}</span>
      </button>`
        )
        .join('') || '<p class="a-empty">Nothing yet — looks like a fresh idea.</p>'
    }`;
}

$('search').addEventListener('input', renderSidebar);
$('search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('search').value = '';
    renderSidebar();
  }
});

// ---------- editor ----------

function selectDay(n) {
  if (dirty && n !== selected && !confirm(`Discard unsaved changes to Day ${selected}?`)) return;
  selected = n;
  draft = toDraft(days.get(n), n);
  dirty = false;
  renderSidebar();
  renderEditor();
  history.replaceState(null, '', `#day=${n}`);
}

function renderEditor() {
  const n = selected;
  const s = statusOf(n);
  $('editor').innerHTML = `
    <div class="a-editor-head">
      <div>
        <h2>Day ${n}</h2>
        <p>${fmtDate(n, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          ${n === today ? ' · <b>today</b>' : n < today ? ' · archive' : ''}
          · <span class="a-state ${s}">${{ ready: 'ready to play', draft: 'draft (not playable yet)', missing: 'not saved yet' }[s]}</span></p>
        <label class="a-author">Questions by
          <input id="author" value="${esc(draft.author)}" placeholder="Your name" maxlength="60" autocomplete="name" />
        </label>
      </div>
      <div class="a-actions">
        ${days.has(n) ? '<button class="a-btn ghost" data-action="delete">Delete</button>' : ''}
        <button class="a-btn ghost" data-action="preview">Play preview ↗</button>
        <button class="a-btn primary" data-action="save" id="save">Save</button>
      </div>
    </div>
    ${draft.questions.map((_, i) => cardHTML(i)).join('')}`;
  draft.questions.forEach((_, i) => {
    renderRows(i);
  });
  updateSaveButton();
}

function cardHTML(i) {
  const q = draft.questions[i];
  return `
  <section class="a-card" data-q="${i}">
    <header>
      <h3>Q${i + 1} <span>Level ${i + 1} · ${LEVELS[i]}</span></h3>
      <div class="a-card-tools">
        <button class="a-icon" data-action="easier" ${i === 0 ? 'disabled' : ''} title="Swap with the easier question above">▲</button>
        <button class="a-icon" data-action="harder" ${i === QUESTIONS_PER_DAY - 1 ? 'disabled' : ''} title="Swap with the harder question below">▼</button>
      </div>
    </header>
    <label class="a-field"><span>Prompt</span>
      <div class="a-prompt"><em>Click the country</em><input class="prompt" value="${esc(q.prompt)}" placeholder="e.g. with the most active volcanoes" /></div>
    </label>
    <label class="a-field"><span>Source</span>
      <input class="source" value="${esc(q.source)}" placeholder="e.g. Smithsonian Global Volcanism Program, 2024" />
    </label>
    <div class="a-paste">
      <textarea class="paste" rows="2" placeholder="Paste a ranked table here: rows from Wikipedia or a spreadsheet, or lines like '1. Japan — 111'. Country names are matched automatically; the next column becomes the value."></textarea>
      <button class="a-btn ghost small" data-action="parse">Use pasted text</button>
    </div>
    <p class="a-note"></p>
    <ol class="a-rows"></ol>
    <div class="a-card-foot">
      <button class="a-btn ghost small" data-action="add-row">+ Add row</button>
      <p class="a-status"></p>
    </div>
  </section>`;
}

function renderRows(i) {
  const card = $('editor').querySelector(`.a-card[data-q="${i}"]`);
  const q = draft.questions[i];
  const ranks = ranksOf(q.rows);
  card.querySelector('.a-rows').innerHTML = q.rows
    .map(
      (r, j) => `
    <li class="a-row ${r.code ? '' : 'unmatched'}" data-r="${j}">
      <span class="a-rank ${ranks[j] === 1 ? 'first' : ''}">${ranks[j]}</span>
      <label class="a-tie" title="Tied with the row above"><input type="checkbox" class="tie" ${r.tie ? 'checked' : ''} ${j === 0 ? 'disabled' : ''}/> tie</label>
      <input class="country" list="country-names" value="${esc(r.code ? COUNTRY_NAMES[r.code] : r.raw)}" placeholder="Country" />
      <input class="value" value="${esc(r.value)}" placeholder="Value (optional)" />
      <span class="a-row-tools">
        <button class="a-icon" data-action="up" ${j === 0 ? 'disabled' : ''} title="Move up">↑</button>
        <button class="a-icon" data-action="down" ${j === q.rows.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
        <button class="a-icon danger" data-action="remove" title="Remove">×</button>
      </span>
      ${r.code ? '' : `<span class="a-row-hint">Couldn't match “${esc(r.raw)}”. Pick a country, or remove the row.</span>`}
    </li>`
    )
    .join('');
  card.querySelector('.a-note').innerHTML = q.note;
  updateStatus(i);
}

function updateStatus(i) {
  const card = $('editor').querySelector(`.a-card[data-q="${i}"]`);
  const q = draft.questions[i];
  const unmatched = q.rows.filter((r) => !r.code).length;
  const issues = validateDay(fromDraft(draft, { matchedOnly: true }), CODES).byQuestion[i].filter(
    (msg) => !(unmatched && msg.includes('answers (needs'))
  );
  if (unmatched) issues.unshift(`${unmatched} row${unmatched === 1 ? '' : 's'} need${unmatched === 1 ? 's' : ''} a country`);
  const el = card.querySelector('.a-status');
  el.className = `a-status ${issues.length ? 'bad' : 'ok'}`;
  el.textContent = issues.length ? issues.join(' · ') : `✓ ${q.rows.length} answers · ready`;
  card.classList.toggle('ok', !issues.length);
}

function markDirty() {
  dirty = true;
  updateSaveButton();
}

function updateSaveButton() {
  const btn = $('save');
  if (btn) btn.textContent = dirty ? 'Save changes' : 'Saved';
  if (btn) btn.disabled = !dirty;
}

function applyPaste(i, text) {
  const q = draft.questions[i];
  if (!text.trim()) return;
  if (q.rows.length && !confirm(`Replace the ${q.rows.length} rows already in Q${i + 1}?`)) return;
  const { rows, skipped, trimmed } = parseTable(text, MAX_ANSWERS);
  q.rows = rows;
  const matched = rows.filter((r) => r.code).length;
  const notes = [`Matched ${matched} of ${rows.length} rows.`];
  if (skipped.length) notes.push(`Skipped ${skipped.map(esc).join(', ')} (not countries).`);
  if (trimmed) notes.push(`Kept the first ${MAX_ANSWERS}; the rest were dropped.`);
  if (rows.length < MIN_ANSWERS) notes.push(`Needs at least ${MIN_ANSWERS} answers.`);
  q.note = notes.join(' ');
  renderRows(i);
  markDirty();
}

// ---------- events ----------

$('days').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-day]');
  if (btn) selectDay(Number(btn.dataset.day));
});

const editor = $('editor');
const at = (e) => {
  const card = e.target.closest('.a-card');
  const row = e.target.closest('.a-row');
  return { i: card ? Number(card.dataset.q) : null, j: row ? Number(row.dataset.r) : null };
};

editor.addEventListener('input', (e) => {
  if (e.target.id === 'author') {
    draft.author = e.target.value;
    rememberAuthor(e.target.value.trim());
    return markDirty();
  }
  const { i, j } = at(e);
  if (i === null) return;
  const q = draft.questions[i];
  if (e.target.classList.contains('prompt')) q.prompt = e.target.value;
  else if (e.target.classList.contains('source')) q.source = e.target.value;
  else if (e.target.classList.contains('value')) q.rows[j].value = e.target.value;
  else return;
  markDirty();
  updateStatus(i);
});

editor.addEventListener('change', (e) => {
  const { i, j } = at(e);
  if (i === null || j === null) return;
  const row = draft.questions[i].rows[j];
  if (e.target.classList.contains('country')) {
    row.raw = e.target.value;
    row.code = matchCountry(e.target.value);
  } else if (e.target.classList.contains('tie')) {
    row.tie = e.target.checked;
  } else return;
  markDirty();
  renderRows(i);
});

editor.addEventListener('paste', (e) => {
  if (!e.target.classList.contains('paste')) return;
  e.preventDefault();
  applyPaste(at(e).i, e.clipboardData.getData('text/plain'));
});

editor.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { i, j } = at(e);
  const q = i === null ? null : draft.questions[i];
  const swap = (list, a, b) => ([list[a], list[b]] = [list[b], list[a]]);
  switch (btn.dataset.action) {
    case 'save':
      return save();
    case 'delete':
      return remove();
    case 'preview':
      if (dirty && !confirm('Preview shows the last saved version. Open it anyway?')) return;
      return window.open(`/?day=${selected}`, '_blank');
    case 'parse': {
      const area = btn.closest('.a-card').querySelector('.paste');
      applyPaste(i, area.value);
      area.value = '';
      return;
    }
    case 'add-row':
      q.rows.push({ code: null, raw: '', value: '', tie: false });
      break;
    case 'remove':
      q.rows.splice(j, 1);
      break;
    case 'up':
      swap(q.rows, j, j - 1);
      break;
    case 'down':
      swap(q.rows, j, j + 1);
      break;
    case 'easier':
    case 'harder':
      swap(draft.questions, i, btn.dataset.action === 'easier' ? i - 1 : i + 1);
      markDirty();
      return renderEditor();
    default:
      return;
  }
  if (q.rows[0]) q.rows[0].tie = false;
  markDirty();
  renderRows(i);
  if (btn.dataset.action === 'add-row') editor.querySelector(`.a-card[data-q="${i}"] .a-row:last-child .country`)?.focus();
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (dirty) save();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

// ---------- saving ----------

async function save() {
  const unmatched = draft.questions.findIndex((q) => q.rows.some((r) => !r.code));
  if (unmatched !== -1) {
    toast(`Q${unmatched + 1} has rows without a country. Pick one or remove them first.`, true);
    editor.querySelector(`.a-card[data-q="${unmatched}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const day = fromDraft(draft);
  const res = await fetch(`/api/days/${selected}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(day),
  });
  if (!res.ok) return toast(`Couldn't save: ${(await res.json()).error}`, true);
  days.set(selected, day);
  dirty = false;
  renderSummary();
  renderSidebar();
  renderEditor();
  toast(validateDay(day, CODES).ok ? `Saved Day ${selected}: ready to play` : `Saved Day ${selected} as a draft`);
}

async function remove() {
  if (!confirm(`Delete Day ${selected}? Players would get the archive mix that day.`)) return;
  await fetch(`/api/days/${selected}`, { method: 'DELETE' });
  days.delete(selected);
  dirty = false;
  toast(`Deleted Day ${selected}`);
  renderSummary();
  selectDay(selected);
}

let toastTimer;
function toast(message, bad = false) {
  const el = $('toast');
  el.textContent = message;
  el.className = `a-toast show ${bad ? 'bad' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'a-toast'), 3200);
}

// ---------- start ----------

$('country-names').innerHTML = Object.values(COUNTRY_NAMES)
  .sort((a, b) => a.localeCompare(b))
  .map((name) => `<option value="${esc(name)}"></option>`)
  .join('');

const res = await fetch('/api/days');
days = new Map((await res.json()).map((d) => [d.day, d]));
renderSummary();
const fromHash = Number(new URLSearchParams(location.hash.slice(1)).get('day'));
const firstGap = (() => {
  let n = today + 1;
  while (statusOf(n) === 'ready') n++;
  return n;
})();
selectDay(Number.isInteger(fromHash) && location.hash ? fromHash : firstGap);
