// Which map features count as official countries.
//
// src/data/countries.json mirrors Natural Earth's admin_0_countries, which includes
// dependencies, overseas territories and disputed areas alongside the 197 countries the game
// plays with (the 195 UN members and observers, plus Taiwan and Kosovo). Those extras still
// draw as land, so the map looks like the world, but they aren't countries: they get no
// clickable dot, can't be queued as an answer, and a tap on one picks the sovereign state
// instead. Each entry below is a territory code -> the country a tap should resolve to.
//
// Kept free of imports so the Node scripts can read it without JSON import attributes.
export const SOVEREIGN_OF = {
  IOT: 'GBR', FLK: 'GBR', JEY: 'GBR', GGY: 'GBR', IMN: 'GBR', SGS: 'GBR', SHN: 'GBR', PCN: 'GBR',
  AIA: 'GBR', CYM: 'GBR', BMU: 'GBR', VGB: 'GBR', TCA: 'GBR', MSR: 'GBR',
  ABW: 'NLD', CUW: 'NLD', SXM: 'NLD',
  ALA: 'FIN',
  MAC: 'CHN', HKG: 'CHN',
  GRL: 'DNK', FRO: 'DNK',
  MNP: 'USA', VIR: 'USA', GUM: 'USA', ASM: 'USA', PRI: 'USA',
  NIU: 'NZL', COK: 'NZL',
  SPM: 'FRA', WLF: 'FRA', MAF: 'FRA', BLM: 'FRA', PYF: 'FRA', NCL: 'FRA', ATF: 'FRA',
  IOA: 'AUS', HMD: 'AUS', NFK: 'AUS', ATC: 'AUS',
  // Disputed or partially recognised. Each resolves to the state it's internationally
  // recognised as part of (Siachen to the one administering it).
  KAS: 'IND', // Siachen Glacier: disputed, administered by India
  ESH: 'MAR', // Western Sahara: disputed, mostly administered by Morocco
  SOL: 'SOM', // Somaliland: de facto independent, recognised as part of Somalia
  CYN: 'CYP', // Northern Cyprus: recognised only by Türkiye
};

/** The number of official countries, asserted by `npm run check`. */
export const COUNTRY_COUNT = 197;

/** Is this an official country, i.e. one of the 197 that can be picked and queued? */
export const isCountry = (code) => !(code in SOVEREIGN_OF);
