// The question-queue admin page (dev server only): edit a day's five questions, paste
// ranked tables, and save them into src/data/days/ through the API in scripts/queue-api.js.

import './admin.css';
import { dayDate, dayNumber, inboxName, validateDay, QUESTIONS_PER_DAY, MIN_ANSWERS, MAX_ANSWERS } from '../queue.js';
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

let days = new Map(); // scheduled days from src/data/days/
let sets = new Map(); // unscheduled sets from src/data/inbox/, keyed by id
// What's open: a scheduled day, or a set nobody has given a date yet.
let selected = null; // { kind: 'day', n } | { kind: 'set', id }
let draft = null; // editable copy: { day, author, questions: [{ prompt, source, rows: [{ code, raw, value, tie }], note }] }
let dirty = false;

const isSet = () => selected?.kind === 'set';
const label = () => (isSet() ? 'this day' : `Day ${selected.n}`);

/**
 * The first day number the scheduler would hand out. Writers never choose one — this is only
 * so the editor can say roughly when a set will be played. Mirrors scripts/queue-days.mjs.
 */
const nextFreeDay = () => Math.max(today, ...(days.size ? [...days.keys()] : [today])) + 1;

/** Where an unscheduled set is likely to land, given the ones queued ahead of it. */
function likelyDay(id) {
  const ahead = [...sets.keys()].sort().indexOf(id);
  return nextFreeDay() + Math.max(0, ahead);
}

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

function toDraft(day, n = null) {
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
    // an unscheduled set has no day number; it gets one when it lands on main
    ...(d.day === null ? {} : { day: d.day }),
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
const setStatusOf = (id) => (validateDay(sets.get(id), CODES, { scheduled: false }).ok ? 'ready' : 'draft');

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
    const mark = { ready: '✓ ready', draft: '✎ draft', missing: '— empty' }[s];
    const on = selected?.kind === 'day' && selected.n === n;
    return `<button class="a-day ${s} ${on ? 'selected' : ''} ${n === today ? 'today' : ''}" data-day="${n}">
      <span class="a-day-num">Day ${n}</span><span class="a-day-date">${fmtDate(n)}</span>
      <span class="a-day-status">${n === today ? 'today · ' : ''}${mark}${
        days.get(n)?.author ? ` · ${esc(days.get(n).author)}` : ''
      }</span></button>`;
  };
  // Unscheduled sets: written, not yet given a date. Writers only ever see these as "waiting",
  // never as a day number, because the number is decided when they publish.
  const setItem = (id) => {
    const s = setStatusOf(id);
    const on = isSet() && selected.id === id;
    const when = fmtDate(likelyDay(id));
    return `<button class="a-day ${s} ${on ? 'selected' : ''}" data-set="${esc(id)}">
      <span class="a-day-num">${s === 'ready' ? 'Ready to publish' : 'Still writing'}</span>
      <span class="a-day-date">~ ${when}</span>
      <span class="a-day-status">${s === 'ready' ? '✓ waiting to publish' : '✎ draft'}${
        sets.get(id)?.author ? ` · ${esc(sets.get(id).author)}` : ''
      }</span></button>`;
  };
  const upcoming = [];
  for (let n = today + 1; n <= max; n++) upcoming.push(item(n));
  const archive = [];
  for (let n = today - 1; n >= min; n--) if (days.has(n)) archive.push(item(n));
  const waiting = [...sets.keys()].sort().map(setItem);
  $('days').innerHTML = `
    <h2>Not published yet</h2>
    ${waiting.join('') || '<p class="a-empty">Nothing waiting.</p>'}
    <button class="a-add" data-new="1">+ Write a new day</button>
    <h2>Coming up</h2>
    ${upcoming.join('') || '<p class="a-empty">Nothing queued yet.</p>'}
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

function open(next) {
  const same = selected && next.kind === selected.kind && (next.n ?? next.id) === (selected.n ?? selected.id);
  if (dirty && !same && !confirm(`Discard unsaved changes to ${label()}?`)) return;
  selected = next;
  draft = next.kind === 'set' ? toDraft(sets.get(next.id)) : toDraft(days.get(next.n), next.n);
  dirty = false;
  renderSidebar();
  renderEditor();
  history.replaceState(null, '', next.kind === 'set' ? `#set=${next.id}` : `#day=${next.n}`);
}

const selectDay = (n) => open({ kind: 'day', n });

/** Start a new set. Its id is the clock plus the writer's name, so nobody can collide. */
function newSet() {
  const created = new Date().toISOString();
  const id = inboxName(created, rememberedAuthor()).replace(/\.json$/, '');
  sets.set(id, { id, created, author: rememberedAuthor(), questions: [] });
  open({ kind: 'set', id });
}

function renderEditor() {
  const set = isSet();
  const s = set ? setStatusOf(selected.id) : statusOf(selected.n);
  const state = set
    ? { ready: 'ready — press Publish to send it', draft: 'still being written' }[s]
    : { ready: 'ready to play', draft: 'draft (not playable yet)', missing: 'not saved yet' }[s];
  const head = set
    ? `<h2>A new day</h2>
       <p>Will be played on or after <b>${fmtDate(likelyDay(selected.id), { weekday: 'long', day: 'numeric', month: 'long' })}</b>
          · <span class="a-state ${s}">${state}</span></p>`
    : `<h2>Day ${selected.n}</h2>
       <p>${fmtDate(selected.n, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          ${selected.n === today ? ' · <b>today</b>' : selected.n < today ? ' · archive' : ''}
          · <span class="a-state ${s}">${state}</span></p>`;
  const exists = set ? sets.has(selected.id) : days.has(selected.n);
  $('editor').innerHTML = `
    <div class="a-editor-head">
      <div>
        ${head}
        <label class="a-author">Questions by
          <input id="author" value="${esc(draft.author)}" placeholder="Your name" maxlength="60" autocomplete="name" />
        </label>
      </div>
      <div class="a-actions">
        ${exists ? '<button class="a-btn ghost" data-action="delete">Delete</button>' : ''}
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
  const btn = e.target.closest('[data-day], [data-set], [data-new]');
  if (!btn) return;
  if (btn.dataset.new) return newSet();
  if (btn.dataset.set) return open({ kind: 'set', id: btn.dataset.set });
  selectDay(Number(btn.dataset.day));
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
      return window.open(isSet() ? `/?set=${selected.id}` : `/?day=${selected.n}`, '_blank');
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
  const body = fromDraft(draft);
  const set = isSet();
  let stale = null;
  if (set) {
    body.created = sets.get(selected.id)?.created ?? new Date().toISOString();
    // A new set is named before the writer has typed their name, so the first save would
    // leave it as "-anon". Re-derive the name from whatever they've put in since.
    const wanted = inboxName(body.created, body.author).replace(/\.json$/, '');
    if (wanted !== selected.id) {
      if (sets.has(selected.id)) stale = selected.id;
      sets.delete(selected.id);
      selected = { kind: 'set', id: wanted };
      history.replaceState(null, '', `#set=${wanted}`);
    }
  }
  const url = set ? `/api/inbox/${selected.id}` : `/api/days/${selected.n}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return toast(`Couldn't save: ${(await res.json()).error}`, true);
  if (stale) await fetch(`/api/inbox/${stale}`, { method: 'DELETE' });

  if (set) sets.set(selected.id, { id: selected.id, ...body });
  else days.set(selected.n, body);
  dirty = false;
  renderSummary();
  renderSidebar();
  renderEditor();

  const ok = validateDay(body, CODES, { scheduled: !set }).ok;
  if (set) toast(ok ? 'Saved. Press Publish when you want to send it.' : 'Saved — still a draft, keep going.');
  else toast(ok ? `Saved Day ${selected.n}: ready to play` : `Saved Day ${selected.n} as a draft`);
}

async function remove() {
  const set = isSet();
  const what = set ? 'this unpublished day' : `Day ${selected.n}`;
  const note = set ? '' : ' Players would get the archive mix that day.';
  if (!confirm(`Delete ${what}?${note}`)) return;
  if (set) {
    await fetch(`/api/inbox/${selected.id}`, { method: 'DELETE' });
    sets.delete(selected.id);
    dirty = false;
    toast('Deleted');
    renderSummary();
    return openSomething();
  }
  await fetch(`/api/days/${selected.n}`, { method: 'DELETE' });
  days.delete(selected.n);
  dirty = false;
  toast(`Deleted Day ${selected.n}`);
  renderSummary();
  selectDay(selected.n);
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

async function reload() {
  const [dayList, setList] = await Promise.all([
    fetch('/api/days').then((r) => r.json()),
    fetch('/api/inbox').then((r) => r.json()),
  ]);
  days = new Map(dayList.map((d) => [d.day, d]));
  sets = new Map(setList.map((s) => [s.id, s]));
}

/** Open something sensible: whatever you were writing, else a fresh day. */
function openSomething() {
  const waiting = [...sets.keys()].sort();
  if (waiting.length) return open({ kind: 'set', id: waiting[0] });
  return newSet();
}

// ---------- publish ----------

async function publish() {
  const btn = $('publish');
  if (dirty && !confirm('Save your changes first? Press Cancel, then Save.')) return;
  btn.disabled = true;
  const was = btn.textContent;
  btn.textContent = 'Publishing…';
  try {
    const out = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: draft?.author || rememberedAuthor() }),
    }).then((r) => r.json());
    toast(out.message, !out.ok);
    if (out.detail) console.warn('publish detail:', out.detail);
    if (out.ok) {
      await reload();
      renderSummary();
      renderSidebar();
      if ((isSet() && !sets.has(selected.id)) || !selected) openSomething();
      else renderEditor();
    }
  } catch (e) {
    toast('Something went wrong and nothing was changed. Send this to Adam: ' + e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = was;
  }
}

$('publish').addEventListener('click', publish);

// ---------- start ----------

await reload();
renderSummary();
const hash = new URLSearchParams(location.hash.slice(1));
const fromDay = Number(hash.get('day'));
const fromSet = hash.get('set');
if (fromSet && sets.has(fromSet)) open({ kind: 'set', id: fromSet });
else if (location.hash && Number.isInteger(fromDay)) selectDay(fromDay);
else openSomething();
