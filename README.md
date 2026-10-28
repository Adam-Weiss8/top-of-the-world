# 🏔️ Top of the World

A daily geography game. Five questions a day, each asking you to click the country at **#1** on a ranked list ("Click the country with the highest population"). Every answer on the list scores, up to 200 points for #1 and 1,000 for the day, and your points carry a traveller upward. A hiker climbs a mountain, a balloon takes over above the summit, a rocket carries on into orbit, and a perfect day lands an astronaut on the Moon. Players don't find out space is on the table until they get there.

## Running it

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (host anywhere: Netlify, GitHub Pages, Cloudflare Pages…)
npm run check    # validate every queued day and report how far ahead the queue runs
```

## Adding questions (the queue)

For non-developers writing questions, hand them **[WRITING.md](WRITING.md)** instead of this
section — it's the same job with no git or terminal in it.

1. Run `npm run dev` and open **http://localhost:5173/admin.html** (or just double-click
   **Write questions**, which pulls, installs and opens it for you). The admin page only exists on the dev server and is never deployed.
2. The sidebar shows **Not published yet**, **Coming up**, **Today**, and the **Archive**. Click **+ Write a new day** to start one, and put your name in **Questions by**. The game shows "Today's questions by …" on the start screen and recap, and your name is remembered on your computer for next time.
   - **Search past questions** (top of the sidebar) before writing one: type a word or two (e.g. `volcano`) to see every saved question containing them, with its climb number, date and Q1–Q5 slot. Click one to open that day. Run `git pull` first so you're searching everyone's latest days.
3. Each day has five questions, Q1 (level 1, easiest) to Q5 (level 5, hardest). For each question:
   - Type the prompt. It reads as "Click the country …".
   - Type the source.
   - Paste a ranked table into the dashed box: rows copied from Wikipedia or a spreadsheet, or lines like `1. Japan — 111`. Country names are matched automatically, including spellings like "Korea, Rep." and "Côte d'Ivoire". The next column becomes the value. Rows like "World" are skipped, and anything past 20 is dropped.
   - Fix any red rows (pick a country or remove the row), tick **tie** where a row shares the rank above, and use ↑ ↓ to reorder. ▲ ▼ swaps a question's difficulty slot.
4. **Save** (or Ctrl+S). Incomplete days save as drafts. A day is *ready* when all five questions have a prompt, a source and 10–20 matched answers. **Play preview** opens it in the game without touching your real progress — `/?day=N` for a scheduled day, `/?set=<id>` for one that isn't scheduled yet.
5. Press **Publish**. The top bar warns when fewer than 7 days are queued.

### How a day gets its date

Nobody picks a day number, because two people picking the same one is the one thing git can't
merge. A new day is saved to `src/data/inbox/` under a filename made from the clock and the
author's name, so two writers can never create the same path and their pushes can never
conflict. When it lands on main, the deploy workflow runs `npm run queue`
([scripts/queue-days.mjs](scripts/queue-days.mjs)), which moves each set into the next free
`day_N.json`, oldest first, and commits that before building.

Two rules keep the schedule stable: oldest set first, and never a day that has already been
played — so a set pushed late is appended rather than dropped in front of a puzzle somebody has
already seen. Scheduled days are never rewritten.

Useful while poking at it:

```sh
npm run queue -- --dry   # what would be scheduled, changing nothing
npm run queue            # schedule it
npm run doctor           # what state this copy is in, in plain language
npm run doctor -- --fix  # reset to a clean copy of GitHub, keeping unpublished work
```

### Setting up a new writer

Install git and node on their machine, **clone** the repo, and make a shortcut to **Write
questions.bat** (Windows) or **Write questions.command** (macOS) somewhere they'll find it.
Then send them [WRITING.md](WRITING.md). They need push access to the repo; everything else
the launcher and the Publish button handle.

On macOS, two things to get right:

- **Clone it, don't download the ZIP.** A ZIP loses the executable bit, so the `.command`
  file won't do anything when double-clicked. If that's already happened, one command fixes
  it: `chmod +x "Write questions.command"`.
- The first double-click opens Terminal and may ask them to allow it. After that it just runs.
  Dragging the file to the Dock gives them a one-click icon.

If the launcher says node isn't installed when it is, they've probably installed it since the
Terminal window was last opened — closing Terminal and double-clicking again picks it up.

Day 1 is `LAUNCH` in `src/queue.js` (currently 23 Oct 2026). Days 0, −1 and −2 are the original test questions and form the starting archive. **If a day isn't ready, players get an archive mix:** one random question per level from earlier days, the same for everyone.

Note: queued days are bundled into the site, so a determined player could read future answers in the page source. That's the usual trade-off for a static daily game.

In dev mode, `window.totw` exposes the map and journey in the browser console. For example, `totw.journey.jumpTo(1000)` shows the Moon landing.

## Rules

- **Lists have 10–20 answers.** Points follow one curve, stretched to the list's length: #1 is always 200 and last place always 10. On a 20-answer list that's 200, 180, 165, 150, 138 … 10. Missing the list scores 0.
- **Ranks stay secret during play.** After each answer, players see only their points and the climb. The recap at the end shows every list, coloured onto the map by tier with rank badges.
- **Colours** (dots and share emoji): 🟨 #1 · 🟪 #2–3 · 🟦 #4–10 · 🟩 #11–20 · ⬜ miss. Shorter lists scale with the curve.

## How it works

| File | What it does |
| --- | --- |
| `src/data/days/day_N.json` | The scheduled days, one file per day. |
| `src/data/inbox/*.json` | Days written but not yet given a date; `npm run queue` moves them across. |
| `src/queue.js` | Day numbering (`LAUNCH`), the day-file format, validation. Shared by the game, admin and checker. |
| `src/questions.js` | Loads every day file into the game. |
| `src/daily.js` | Picks today's questions (the queued day, or the archive mix), the scoring curve, and colour tiers. |
| `admin.html`, `src/admin/` | The question-queue admin page and its table-pasting/name-matching logic. |
| `scripts/queue-api.js` | Dev-server API the admin page saves through. |
| `src/landmarks.js` | Turns points into altitude (stretched scale: 200 = summit, 600 = ISS, 1000 = Moon) and lists the landmarks. |
| `src/journey.js` | The full-screen journey scene: the hiker → balloon → rocket → astronaut, with the handoff animations. Players can scroll down to look back, never above their height. |
| `src/map.js` | MapLibre GL map from bundled country shapes: picking, tiny-country dots, and the coloured recap reveal. |
| `src/topo.js` | Generates the seamless topographic contour textures and lat/long grid for the map. |
| `src/main.js` | Game flow: intro → question → journey → recap/share. Saves progress in `localStorage`. |
| `scripts/build-countries.mjs` | Regenerates `src/data/countries.json` and the name aliases from Natural Earth 1:50m (`npm run countries`). |

- **No map tiles or API keys.** The map is one bundled GeoJSON (Natural Earth 1:50m, ~410 KB gzipped) styled as a game board, which also keeps country names hidden.
- **Small countries.** About 60 countries too small to click at world zoom (Singapore, Bahrain, Malta, …) get a clickable dot, coloured by rank in the recap. Taps snap to a nearby dot or coastline.

## Before launch

- [ ] Check every figure in `questions.js` against its `source`. The current values, especially ranks 11–20, are placeholders.
- [ ] Queue up days with the admin page, and set `LAUNCH` in `src/queue.js` to the real launch date.

## Analytics

Visits are counted by [GoatCounter](https://www.goatcounter.com) — cookieless, no personal
data, so no consent banner. The dashboard is at `https://<site-code>.goatcounter.com`, and the
site code appears in exactly one place: the snippet in `index.html`.

On top of page visits, [src/analytics.js](src/analytics.js) sends two events:

| Event | When |
| --- | --- |
| `started` | somebody presses **Start the climb** |
| `finished` | somebody confirms their fifth answer |

`finished` is deliberately *not* hooked to `showRecap()`, which also runs when a finished day is
reopened and every time a player re-watches their climb — counting there would inflate the
number every time someone revisits. Both events no-op in dev builds and on `?day=` / `?set=`
preview links, so writing and checking questions never looks like playing.

Ad blockers will stop the snippet for some visitors, so treat the numbers as a trend rather
than a census.
