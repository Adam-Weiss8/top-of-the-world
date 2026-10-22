// Turns pasted research (Wikipedia tables, spreadsheet rows, "1. Japan — 111" lines)
// into ranked rows of country codes.

import countries from '../data/countries.json';
import naturalEarthAliases from '../data/aliases.json';

// Names used by the World Bank, UN, IMF and Wikipedia that Natural Earth doesn't list.
const EXTRA_ALIASES = {
  USA: ['United States', 'US', 'U.S.', 'America', 'United States (USA)'],
  GBR: ['UK', 'U.K.', 'Britain', 'Great Britain', 'United Kingdom of Great Britain and Northern Ireland'],
  RUS: ['Russian Federation'],
  KOR: ['Korea', 'Korea, Republic of', 'Republic of Korea'],
  PRK: ["Korea, Dem. People's Rep.", "Democratic People's Republic of Korea", 'DPRK', 'Korea, North'],
  COD: ['DR Congo', 'DRC', 'Congo (Kinshasa)', 'Congo-Kinshasa', 'Congo, Democratic Republic'],
  COG: ['Republic of the Congo', 'Congo (Brazzaville)', 'Congo-Brazzaville', 'Congo, Rep.', 'Congo'],
  CIV: ['Ivory Coast', "Cote d'Ivoire"],
  CZE: ['Czech Republic'],
  TUR: ['Türkiye', 'Turkiye'],
  MMR: ['Burma'],
  SWZ: ['Swaziland', 'Eswatini'],
  CPV: ['Cape Verde', 'Cabo Verde'],
  TLS: ['East Timor'],
  VAT: ['Vatican City', 'Holy See'],
  MKD: ['Macedonia', 'North Macedonia'],
  IRN: ['Iran, Islamic Rep.', 'Islamic Republic of Iran'],
  VNM: ['Viet Nam'],
  LAO: ['Lao PDR', "Lao People's Democratic Republic"],
  SYR: ['Syrian Arab Republic'],
  EGY: ['Egypt, Arab Rep.'],
  VEN: ['Venezuela, RB', 'Bolivarian Republic of Venezuela'],
  BOL: ['Plurinational State of Bolivia'],
  YEM: ['Yemen, Rep.'],
  GMB: ['Gambia, The', 'The Gambia'],
  BHS: ['Bahamas, The', 'The Bahamas'],
  FSM: ['Micronesia, Fed. Sts.', 'Micronesia'],
  BRN: ['Brunei Darussalam'],
  KGZ: ['Kyrgyz Republic'],
  SVK: ['Slovak Republic'],
  HKG: ['Hong Kong SAR, China', 'Hong Kong SAR'],
  MAC: ['Macao SAR, China', 'Macau'],
  PSE: ['State of Palestine', 'West Bank and Gaza', 'Palestinian Territories'],
  TWN: ['Chinese Taipei', 'Taiwan, China', 'Republic of China'],
  TZA: ['United Republic of Tanzania'],
  MDA: ['Republic of Moldova'],
  STP: ['Sao Tome and Principe'],
  KNA: ['Saint Kitts and Nevis'],
  VCT: ['Saint Vincent and the Grenadines'],
  ATG: ['Antigua and Barbuda'],
  BIH: ['Bosnia and Herzegovina', 'Bosnia'],
  CAF: ['CAR'],
  NLD: ['Holland', 'Netherlands (Kingdom of the)'],
  CHN: ["People's Republic of China", 'China (PRC)', 'Mainland China', 'PRC'],
};

// Rows that commonly appear in ranked tables but aren't countries.
const AGGREGATES = new Set(
  [
    'world', 'european union', 'eu', 'euro area', 'eurozone', 'oecd', 'opec', 'asia', 'africa', 'europe',
    'americas', 'north america', 'south america', 'latin america', 'oceania', 'middle east', 'arab world',
    'others', 'other', 'rest of world', 'rest of the world', 'total', 'g7', 'g20', 'high income', 'low income',
    'middle income', 'sub saharan africa', 'international waters',
  ].map((s) => s)
);

/** Lowercase, accent-free, punctuation-free, "St." → "saint", no "the". */
export function normalize(text, { keepParens = true } = {}) {
  let s = String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\[[^\]]*\]/g, ' ') // footnotes like [a] or [note 1]
    .replace(/[*†‡§¶#]/g, ' ');
  if (!keepParens) s = s.replace(/\([^)]*\)/g, ' ');
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bst\b/g, 'saint')
    .replace(/\bthe\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAMES = Object.fromEntries(countries.features.map((f) => [f.properties.code, f.properties.name]));
export const COUNTRY_NAMES = NAMES;

const INDEX = new Map();
for (const [code, names] of Object.entries({ ...naturalEarthAliases })) {
  if (!NAMES[code]) continue;
  for (const n of [code, ...names, ...(EXTRA_ALIASES[code] ?? [])]) {
    const key = normalize(n);
    if (key && !INDEX.has(key)) INDEX.set(key, code);
  }
}
// Extra aliases win over Natural Earth's for ambiguous short names (e.g. "Congo").
for (const [code, names] of Object.entries(EXTRA_ALIASES)) {
  if (NAMES[code]) for (const n of names) INDEX.set(normalize(n), code);
}

/** Country code for a name (any common spelling), or null. */
export function matchCountry(text) {
  if (!text) return null;
  const raw = String(text).trim();
  if (/^[A-Z]{3}$/.test(raw) && NAMES[raw]) return raw;
  for (const keepParens of [true, false]) {
    const key = normalize(raw, { keepParens });
    if (INDEX.has(key)) return INDEX.get(key);
    // "Korea, South" → "South Korea"
    const comma = key.match(/^(.+?) (?:,)?(.*)$/) && raw.includes(',') ? normalize(raw.split(',').reverse().join(' '), { keepParens }) : null;
    if (comma && INDEX.has(comma)) return INDEX.get(comma);
  }
  return null;
}

const isRankCell = (cell) => /^(?:=|T-?)?\s*\d+\s*[.)]?$/i.test(cell.trim()); // 3, 3., =3, T3, T-3
const rankOf = (cell) => Number(cell.replace(/\D/g, ''));
const clean = (cell) => cell.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

function parseLine(line) {
  const cells = line.includes('\t') ? line.split('\t').map(clean) : null;

  if (cells) {
    const rank = cells.length && isRankCell(cells[0]) ? rankOf(cells[0]) : null;
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i] || isRankCell(cells[i])) continue;
      const code = matchCountry(cells[i]);
      if (code) {
        const value = cells.slice(i + 1).find((c) => c) ?? '';
        return { code, raw: cells[i], value, rank };
      }
    }
    const raw = cells.find((c) => c && !isRankCell(c) && /[a-z]/i.test(c)) ?? '';
    const value = cells.slice(cells.indexOf(raw) + 1).find((c) => c) ?? '';
    return { code: null, raw, value, rank };
  }

  // Free text: optional rank, then the longest run of words that names a country, then the value.
  let rest = clean(line);
  let rank = null;
  const lead = rest.match(/^(?:=|T-?)?\s*(\d+)\s*[.):\-–—]?\s+/i);
  if (lead) {
    rank = Number(lead[1]);
    rest = rest.slice(lead[0].length);
  }
  const words = rest.split(' ');
  for (let k = words.length; k >= 1; k--) {
    const code = matchCountry(words.slice(0, k).join(' ').replace(/[,:;—–-]+$/, ''));
    if (code) {
      const value = words.slice(k).join(' ').replace(/^[\s,:;|—–-]+/, '').trim();
      return { code, raw: words.slice(0, k).join(' '), value, rank };
    }
  }
  const split = rest.split(/\s+[—–-]\s+|\s*[,:|]\s+|\s{2,}/);
  return { code: null, raw: split[0] ?? rest, value: split.slice(1).join(' '), rank };
}

/**
 * Parse pasted text into rows: { rows: [{ code, raw, value, tie }], skipped: [names], trimmed }.
 * Header rows and aggregates ("World", "European Union") are skipped; ties come from repeated
 * rank numbers; anything past `limit` matched rows is trimmed.
 */
export function parseTable(text, limit = 20) {
  const rows = [];
  const skipped = [];
  let trimmed = false;
  let lastRank = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = parseLine(line);
    if (!row.code) {
      const key = normalize(row.raw, { keepParens: false });
      if (!key || AGGREGATES.has(key) || /\b(country|rank|nation|territory|name)\b/.test(key)) {
        if (key && !/\b(country|rank|nation|territory|name)\b/.test(key)) skipped.push(row.raw);
        continue;
      }
    }
    if (rows.length >= limit) {
      trimmed = true;
      break;
    }
    const tie = rows.length > 0 && row.rank !== null && row.rank === lastRank;
    lastRank = row.rank;
    rows.push({ code: row.code, raw: row.raw, value: row.value, tie });
  }
  return { rows, skipped, trimmed };
}
