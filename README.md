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

1. Run `npm run dev` and open **http://localhost:5173/admin.html**. The admin page only exists on the dev server and is never deployed.
2. The sidebar shows **Upcoming** days, **Today**, and the **Archive**. Click **+ Queue Day N** to start the next day.
3. Each day has five questions, Q1 (level 1, easiest) to Q5 (level 5, hardest). For each question:
   - Type the prompt. It reads as "Click the country …".
   - Type the source.
   - Paste a ranked table into the dashed box: rows copied from Wikipedia or a spreadsheet, or lines like `1. Japan — 111`. Country names are matched automatically, including spellings like "Korea, Rep." and "Côte d'Ivoire". The next column becomes the value. Rows like "World" are skipped, and anything past 20 is dropped.
   - Fix any red rows (pick a country or remove the row), tick **tie** where a row shares the rank above, and use ↑ ↓ to reorder. ▲ ▼ swaps a question's difficulty slot.
4. **Save** (or Ctrl+S). Incomplete days save as drafts. A day is *ready* when all five questions have a prompt, a source and 10–20 matched answers. **Play preview** opens that day in the game (`/?day=N`) without touching your real progress.
5. Commit `src/data/days/` and deploy. The top bar warns when fewer than 7 days are queued.

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
| `src/data/days/day_N.json` | The queued days, one file per day (edited through the admin page). |
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
