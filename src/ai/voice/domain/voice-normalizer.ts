/**
 * Cleans a speech transcript before it reaches the assistant, and says what it changed:
 *  - jewellery words the recogniser often mis-spells ("payel" → "payal", "girwi" → "girvi", "70 touch" → "70 tunch");
 *  - spoken numbers next to a unit or an amount word become digits ("paanch gram" → "5 gram", "sattar percent" →
 *    "70%", "pandrah hazaar" → "15000", "dedh lakh" → "150000", "do aana" → "2 aana");
 *  - traditional units (tola, aana, ratti, bhar, masha) are kept exactly as said and flagged — never converted:
 *    their size differs by region and "aana" can also mean purity (14 aana = 87.5%), so the assistant asks.
 * A number word on its own ("ek payal", "do" as in "give") is left alone. The original transcript is always kept.
 */

export interface NormalizedTranscript {
  original: string;
  text: string;
  /** e.g. unit:aana, unit:tola, fraction, amount */
  flags: string[];
  changes: { from: string; to: string }[];
}

const ONES: Record<string, number> = {
  ek: 1,
  do: 2,
  teen: 3,
  tin: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  paach: 5,
  chhe: 6,
  chhah: 6,
  chah: 6,
  che: 6,
  saat: 7,
  sat: 7,
  aath: 8,
  aat: 8,
  nau: 9,
  das: 10,
  dus: 10,
  gyarah: 11,
  gyara: 11,
  barah: 12,
  bara: 12,
  terah: 13,
  tera: 13,
  chaudah: 14,
  chauda: 14,
  pandrah: 15,
  pandra: 15,
  solah: 16,
  sola: 16,
  satrah: 17,
  satra: 17,
  atharah: 18,
  athara: 18,
  unnis: 19,
  unees: 19,
  bees: 20,
  bis: 20,
  ikkis: 21,
  ikkees: 21,
  bais: 22,
  baees: 22,
  teis: 23,
  chaubis: 24,
  chaubees: 24,
  pachis: 25,
  pachchis: 25,
  pachchees: 25,
  pachees: 25,
  chhabbis: 26,
  chhabbees: 26,
  sattais: 27,
  sattaees: 27,
  atthais: 28,
  atthaees: 28,
  untis: 29,
  untees: 29,
  tees: 30,
  tis: 30,
  ikattis: 31,
  battis: 32,
  tentis: 33,
  chautis: 34,
  paintis: 35,
  chhattis: 36,
  saintis: 37,
  adtis: 38,
  untalis: 39,
  chalis: 40,
  chaalis: 40,
  iktalis: 41,
  byalis: 42,
  taintalis: 43,
  chavalis: 44,
  paintalis: 45,
  chhiyalis: 46,
  saintalis: 47,
  adtalis: 48,
  unchas: 49,
  pachas: 50,
  pachaas: 50,
  ikyavan: 51,
  bavan: 52,
  tirpan: 53,
  chauvan: 54,
  pachpan: 55,
  chhappan: 56,
  sattavan: 57,
  atthavan: 58,
  unsath: 59,
  saath: 60,
  sath: 60,
  iksath: 61,
  basath: 62,
  tirsath: 63,
  chausath: 64,
  painsath: 65,
  chhiyasath: 66,
  sadsath: 67,
  adsath: 68,
  unhattar: 69,
  sattar: 70,
  ikhattar: 71,
  bahattar: 72,
  tihattar: 73,
  chauhattar: 74,
  pachhattar: 75,
  chhihattar: 76,
  sathattar: 77,
  athhattar: 78,
  unasi: 79,
  assi: 80,
  ikyasi: 81,
  bayasi: 82,
  tirasi: 83,
  chaurasi: 84,
  pachasi: 85,
  chhiyasi: 86,
  sattasi: 87,
  atthasi: 88,
  navasi: 89,
  nabbe: 90,
  nabbey: 90,
  ikyanve: 91,
  banve: 92,
  tiranve: 93,
  chauranve: 94,
  pachanve: 95,
  chhiyanve: 96,
  sattanve: 97,
  atthanve: 98,
  ninyanve: 99,
  // Devanagari
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  छः: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
  ग्यारह: 11,
  बारह: 12,
  तेरह: 13,
  चौदह: 14,
  पंद्रह: 15,
  पन्द्रह: 15,
  सोलह: 16,
  सत्रह: 17,
  अठारह: 18,
  उन्नीस: 19,
  बीस: 20,
  पच्चीस: 25,
  तीस: 30,
  चालीस: 40,
  पचास: 50,
  साठ: 60,
  सत्तर: 70,
  अस्सी: 80,
  नब्बे: 90,
};

const MULTIPLIERS: Record<string, number> = {
  sau: 100,
  सौ: 100,
  hazaar: 1000,
  hazar: 1000,
  hajaar: 1000,
  hajar: 1000,
  thousand: 1000,
  हज़ार: 1000,
  हजार: 1000,
  lakh: 100000,
  lac: 100000,
  laakh: 100000,
  लाख: 100000,
  crore: 10000000,
  karod: 10000000,
  करोड़: 10000000,
};

/** Values on their own (dedh = 1.5) and modifiers of the next number (saadhe 5 = 5.5). */
const FRACTIONS: Record<string, number> = { dedh: 1.5, dedhh: 1.5, डेढ़: 1.5, dhai: 2.5, dhaai: 2.5, ढाई: 2.5 };
const MODIFIERS: Record<string, number> = {
  sawa: 0.25,
  savaa: 0.25,
  sava: 0.25,
  सवा: 0.25,
  saadhe: 0.5,
  sadhe: 0.5,
  saade: 0.5,
  साढ़े: 0.5,
  paune: -0.25,
  पौने: -0.25,
};

/** Words that make a number a quantity (only then are number words turned into digits). */
const UNIT_WORDS = new Set([
  'gram',
  'grams',
  'gm',
  'gms',
  'g',
  'graam',
  'ग्राम',
  'kilo',
  'kg',
  'mg',
  'tola',
  'tole',
  'tolaa',
  'तोला',
  'तोले',
  'aana',
  'anna',
  'ana',
  'आना',
  'आने',
  'ratti',
  'rati',
  'रत्ती',
  'bhar',
  'bhari',
  'भर',
  'masha',
  'maasha',
  'माशा',
  'percent',
  'pratishat',
  'प्रतिशत',
  '%',
  'tunch',
  'touch',
  'टंच',
  'rupaye',
  'rupaiye',
  'rupay',
  'rupees',
  'rupee',
  'rs',
  '₹',
  'रुपये',
  'रुपए',
  'karat',
  'carat',
  'kt',
  'k',
  'कैरेट',
  'piece',
  'pieces',
  'pc',
  'pcs',
  'nag',
  'नग',
  'mahine',
  'mahina',
  'month',
  'months',
  'saal',
  'year',
  'years',
  'din',
  'days',
  'day',
  'महीने',
  'साल',
  'दिन',
]);
const PERCENT_WORDS = new Set(['percent', 'pratishat', 'प्रतिशत']);

/** Traditional units: kept as said, flagged so the assistant asks instead of converting. */
const TRADITIONAL: Record<string, string> = {
  tola: 'tola',
  tole: 'tola',
  tolaa: 'tola',
  तोला: 'tola',
  तोले: 'tola',
  aana: 'aana',
  anna: 'aana',
  ana: 'aana',
  आना: 'aana',
  आने: 'aana',
  ratti: 'ratti',
  rati: 'ratti',
  रत्ती: 'ratti',
  bhar: 'bhar',
  bhari: 'bhar',
  भर: 'bhar',
  masha: 'masha',
  maasha: 'masha',
  माशा: 'masha',
};

/** Spellings the recogniser produces → the word the shop uses (whole words, Latin script). */
const VOCABULARY: [RegExp, string][] = [
  [/\b(?:payel|paayal|pyal|paayel)\b/gi, 'payal'],
  [/\b(?:bichiya|bichia|bichhia|bichhua|bichua|bichwa)\b/gi, 'bichhiya'],
  [/\b(?:jhumkaa|jumka|jhumkha|jhoomka)\b/gi, 'jhumka'],
  [/\b(?:girwi|girvee|girwee|girvy)\b/gi, 'girvi'],
  [/\b(?:udhar|udhaari|udhari|udhhar)\b/gi, 'udhaar'],
  [/\bgraam\b/gi, 'gram'],
  [/\b(?:tanch|tunj)\b/gi, 'tunch'],
  [/\b(?:byaaj|biyaj|biaj)\b/gi, 'byaj'],
  [/\b(?:chaandi|chandee|chandi)\b/gi, 'chandi'],
];

const WORD = /[\p{L}\p{M}\p{N}₹%.]+|[^\p{L}\p{M}\p{N}₹%.]+/gu;
const isSpace = (s: string) => /^\s+$/.test(s);
const key = (w: string) => w.toLowerCase().replace(/\.$/, '');

function numberValue(word: string): number | null {
  const k = key(word);
  if (/^\d+(?:\.\d+)?$/.test(k)) return Number(k);
  return ONES[k] ?? FRACTIONS[k] ?? null;
}

export function normalizeTranscript(raw: string): NormalizedTranscript {
  const original = (raw ?? '').replace(/\s+/g, ' ').trim();
  const changes: { from: string; to: string }[] = [];
  const flags = new Set<string>();

  let text = original.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)));
  if (text !== original) changes.push({ from: 'Devanagari digits', to: 'digits' });
  for (const [pattern, to] of VOCABULARY) {
    text = text.replace(pattern, (m) => {
      if (m.toLowerCase() !== to) changes.push({ from: m, to });
      return to;
    });
  }
  // "70 touch" is the recogniser hearing "70 tunch" (silver purity).
  text = text.replace(/(\d+(?:\.\d+)?)\s*touch\b/gi, (m, n: string) => {
    changes.push({ from: m, to: `${n} tunch` });
    return `${n} tunch`;
  });

  const parts = text.match(WORD) ?? [];
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const word = parts[i];
    const k = key(word);
    const startsRun = numberValue(word) !== null || k in MULTIPLIERS || k in MODIFIERS;
    if (!startsRun || isSpace(word)) {
      out.push(word);
      i++;
      continue;
    }
    // Collect a run of number words / digits / multipliers separated only by spaces.
    const run: string[] = [];
    let j = i;
    while (j < parts.length) {
      const w = parts[j];
      const wk = key(w);
      if (numberValue(w) !== null || wk in MULTIPLIERS || wk in MODIFIERS) {
        run.push(w);
        j++;
        if (j < parts.length && isSpace(parts[j]) && j + 1 < parts.length) {
          const next = parts[j + 1];
          const nk = key(next);
          if (numberValue(next) !== null || nk in MULTIPLIERS || nk in MODIFIERS) {
            j++;
            continue;
          }
        }
        break;
      }
      break;
    }
    // The word after the run (skipping one space) decides whether this is a quantity.
    const afterIndex = j < parts.length && isSpace(parts[j]) ? j + 1 : j;
    const after = afterIndex < parts.length ? key(parts[afterIndex]) : '';
    const hasMultiplier = run.some((w) => key(w) in MULTIPLIERS);
    const hasWordNumber = run.some((w) => !/^\d/.test(w));
    const quantity = UNIT_WORDS.has(after) || hasMultiplier;
    const value = quantity && hasWordNumber ? evaluate(run) : null;

    if (value === null) {
      for (let x = i; x < j; x++) out.push(parts[x]);
      i = j;
      continue;
    }
    const digits = String(Number(value.toFixed(3)));
    const from = parts.slice(i, j).join('');
    if (run.some((w) => key(w) in FRACTIONS || key(w) in MODIFIERS)) flags.add('fraction');
    if (PERCENT_WORDS.has(after)) {
      out.push(`${digits}%`);
      changes.push({ from: `${from} ${parts[afterIndex]}`, to: `${digits}%` });
      i = afterIndex + 1;
      continue;
    }
    out.push(digits);
    changes.push({ from, to: digits });
    i = j;
  }
  text = out.join('');

  // Flags for traditional units and amounts (after digits are in place).
  for (const match of text.matchAll(/[\p{L}\p{M}]+/gu)) {
    const unit = TRADITIONAL[match[0].toLowerCase()];
    if (!unit) continue;
    // "ana" is also an ordinary word: only a unit right after a number.
    const before = text.slice(0, match.index).trimEnd();
    if (unit === 'aana' && !/(\d|\b(?:do|ek|teen|char|chaar))$/i.test(before)) continue;
    flags.add(`unit:${unit}`);
  }
  if (/(?:₹|\brs\.?|\brupaye|\brupees?\b|\d{4,})/i.test(text)) flags.add('amount');

  return { original, text, flags: [...flags], changes };
}

/** Number words → value (Indian grouping: sau, hazaar, lakh, crore; dedh / dhai; sawa / saadhe / paune). */
function evaluate(run: string[]): number | null {
  let total = 0;
  let current = 0;
  let modifier = 0;
  let seen = false;
  for (const w of run) {
    const k = key(w);
    if (k in MODIFIERS) {
      modifier = MODIFIERS[k];
      continue;
    }
    const multiplier = MULTIPLIERS[k];
    if (multiplier) {
      const base = (current || 1) + modifier;
      modifier = 0;
      if (multiplier === 100) current = base * 100;
      else {
        total += base * multiplier;
        current = 0;
      }
      seen = true;
      continue;
    }
    const n = numberValue(w);
    if (n === null) return null;
    current += n + modifier;
    modifier = 0;
    seen = true;
  }
  if (!seen) return modifier ? 1 + modifier : null;
  return total + current;
}
