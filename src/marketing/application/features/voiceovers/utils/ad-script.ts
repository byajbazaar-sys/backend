import { hindiGrams, hindiNumber } from '@shared-libs';

import { AdScriptFacts } from './ad-script-facts';
import { AdScriptStyle } from './ad-script-style';
import { describePiece } from '../../photoshoots/utils/photoshoot.prompts';

type Gender = 'm' | 'f' | 'pl';
type Pick = <T>(options: readonly T[]) => T;

/** How each kind of piece is said: English (plural?), Hindi and Hinglish nouns with their grammatical gender. */
const NOUNS: Record<string, { en: string; plural?: boolean; hi: [string, Gender]; hinglish: [string, Gender] }> = {
  'pair of earrings': { en: 'earrings', plural: true, hi: ['झुमके', 'pl'], hinglish: ['ईयररिंग्स', 'pl'] },
  mangalsutra: { en: 'mangalsutra', hi: ['मंगलसूत्र', 'm'], hinglish: ['मंगलसूत्र', 'm'] },
  'choker necklace': { en: 'choker', hi: ['चोकर हार', 'm'], hinglish: ['चोकर', 'm'] },
  necklace: { en: 'necklace', hi: ['हार', 'm'], hinglish: ['नेकलेस', 'm'] },
  pendant: { en: 'pendant', hi: ['लॉकेट', 'm'], hinglish: ['पेंडेंट', 'm'] },
  'maang tikka': { en: 'maang tikka', hi: ['मांग टीका', 'm'], hinglish: ['मांग टीका', 'm'] },
  'nose ring': { en: 'nose ring', hi: ['नथ', 'f'], hinglish: ['नोज़ रिंग', 'f'] },
  'pair of anklets': { en: 'anklets', plural: true, hi: ['पायल', 'f'], hinglish: ['पायल', 'f'] },
  'kada (thick bangle)': { en: 'kada', hi: ['कड़ा', 'm'], hinglish: ['कड़ा', 'm'] },
  bangle: { en: 'bangle', hi: ['चूड़ी', 'f'], hinglish: ['बैंगल', 'f'] },
  bracelet: { en: 'bracelet', hi: ['ब्रेसलेट', 'm'], hinglish: ['ब्रेसलेट', 'm'] },
  chain: { en: 'chain', hi: ['चेन', 'f'], hinglish: ['चेन', 'f'] },
  ring: { en: 'ring', hi: ['अंगूठी', 'f'], hinglish: ['रिंग', 'f'] },
  'jewellery piece': { en: 'piece', hi: ['गहना', 'm'], hinglish: ['ज्वेलरी पीस', 'm'] },
};

const METALS: Record<string, { en: string; hiOf: string; hinglish: string }> = {
  gold: { en: 'gold', hiOf: 'सोने', hinglish: 'गोल्ड' },
  rose_gold: { en: 'rose gold', hiOf: 'रोज़ गोल्ड', hinglish: 'रोज़ गोल्ड' },
  silver: { en: 'silver', hiOf: 'चांदी', hinglish: 'सिल्वर' },
  platinum: { en: 'platinum', hiOf: 'प्लैटिनम', hinglish: 'प्लैटिनम' },
  diamond: { en: 'diamond', hiOf: 'हीरे', hinglish: 'डायमंड' },
};

/** "22K", "916", "18 kt", "925", "sterling" → what can honestly be said about the purity. */
function purityOf(purity: string | undefined, metal: string): { karat?: number; sterling?: boolean; fine?: boolean } {
  const p = (purity ?? '').toLowerCase();
  if (!p) return {};
  if (metal === 'silver') {
    if (/925|92\.5|sterling/.test(p)) return { sterling: true };
    if (/999|99\.9|fine/.test(p)) return { fine: true };
    return {};
  }
  const k = /(\d{2})\s*(?:k|kt|karat|carat|ct)\b/.exec(p);
  if (k) return { karat: Number(k[1]) };
  if (/\b(999|99\.9)\b/.test(p)) return { karat: 24 };
  if (/\b(916|91\.6)\b/.test(p)) return { karat: 22 };
  if (/\b(750|75\.0)\b/.test(p)) return { karat: 18 };
  if (/\b(585|58\.5)\b/.test(p)) return { karat: 14 };
  return {};
}

/** Hindi agreement: m / f / plural form of an adjective or participle. */
const agree = (g: Gender, m: string, f: string, pl: string): string => (g === 'f' ? f : g === 'pl' ? pl : m);

const sentence = (s: string): string =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?।])/g, '$1')
    .trim();

/** "1 gram", "4.5 grams" (English keeps digits: the English voice reads them well). */
const englishGrams = (w: number): string => {
  const v = Math.round(w * 100) / 100;
  return `${v} ${v === 1 ? 'gram' : 'grams'}`;
};

function english(f: Required<AdScriptParts>, pick: Pick): string[] {
  const { noun, plural, metal, purity, grams, hallmarked, shop } = f;
  const purityWords =
    purity.karat && f.gold ? `${purity.karat} karat ` : purity.sterling ? 'sterling ' : purity.fine ? 'pure ' : '';
  const thing = `${purityWords}${metal.en ? `${metal.en} ` : ''}${noun}`;
  const a = (adj: string) => (plural ? adj : `${/^[aeiou]/i.test(adj) ? 'an' : 'a'} ${adj}`);
  const lines: string[] = [];
  if (pick([true, true, false])) {
    lines.push(
      pick([
        'Looking for something special?',
        'Make every moment shine.',
        'Elegance that speaks for itself.',
        'Some things are simply timeless.',
        'Celebrate in style.',
        'Here is the one everyone will ask about.',
        'Small in size, big on style.',
      ]),
    );
  }
  const weight = grams
    ? pick([
        `, weighing just ${englishGrams(grams)}.`,
        ` — just ${englishGrams(grams)} of fine craftsmanship.`,
        `, at only ${englishGrams(grams)}.`,
      ])
    : '.';
  lines.push(
    pick([
      `Presenting ${a('beautiful')} ${thing}`,
      `Meet our stunning ${thing}`,
      `Introducing ${a('exquisite')} ${thing}`,
      `Discover ${a('graceful')} ${thing}`,
      `Say hello to ${a('gorgeous')} ${thing}`,
    ]) + weight,
  );
  if (hallmarked) lines.push(pick(['BIS hallmarked, for complete peace of mind.', 'Hallmarked purity you can trust.']));
  const extras = [
    grams && grams <= 3 ? 'Light, comfortable and made to be worn every day.' : 'Designed to catch every light.',
    'Perfect for gifting, perfect for you.',
    'Finely crafted and beautifully finished.',
    'Made for weddings, festivals and every day in between.',
    'All eyes will be on you.',
  ];
  lines.push(pick(extras));
  const it = plural ? 'them' : 'it';
  lines.push(
    shop
      ? pick([
          `Visit ${shop} today.`,
          `Only at ${shop}.`,
          `Come and see ${it} at ${shop}.`,
          `Make ${it} yours at ${shop}.`,
        ])
      : pick(['Visit us today.', `Make ${it} yours today.`, `Come and see ${it} in store.`]),
  );
  return lines;
}

function hindi(f: Required<AdScriptParts>, pick: Pick): string[] {
  const { metal, purity, grams, hallmarked, shop } = f;
  const [noun, g] = f.hi;
  const of = agree(g, 'का', 'की', 'के');
  const made = agree(g, 'बना', 'बनी', 'बने');
  const isAre = g === 'pl' ? 'हैं' : 'है';
  const thing = metal.hiOf ? `${metal.hiOf} ${of} ${noun}` : noun;
  const lines: string[] = [];
  if (pick([true, true, false])) {
    lines.push(
      pick([
        'कुछ ख़ास ढूंढ रहे हैं?',
        'हर पल को बनाइए यादगार।',
        'सुंदरता जो सबका मन मोह ले।',
        'शादी हो या त्योहार, आप दिखेंगे सबसे अलग।',
        'परंपरा और सुंदरता का अनोखा संगम।',
      ]),
    );
  }
  const whose = g === 'pl' ? 'जिनका' : 'जिसका';
  const weight = grams
    ? pick([
        `, ${whose} वज़न है केवल ${hindiGrams(grams)}।`,
        `, वज़न सिर्फ़ ${hindiGrams(grams)}।`,
        `, केवल ${hindiGrams(grams)} में।`,
      ])
    : '।';
  lines.push(
    pick(
      g === 'pl'
        ? [`पेश हैं ख़ूबसूरत ${thing}`, `देखिए ये शानदार ${thing}`, `प्रस्तुत हैं मनमोहक ${thing}`]
        : [`पेश है एक ख़ूबसूरत ${thing}`, `देखिए यह शानदार ${thing}`, `प्रस्तुत है एक मनमोहक ${thing}`],
    ) + weight,
  );
  if (purity.karat && f.gold) lines.push(`पूरे ${hindiNumber(purity.karat)} कैरेट सोने से ${made} ${isAre}।`);
  else if (purity.sterling) lines.push(`शुद्ध स्टर्लिंग चांदी से ${made} ${isAre}।`);
  else if (purity.fine) lines.push(`शुद्ध चांदी से ${made} ${isAre}।`);
  if (hallmarked) lines.push(pick(['बी आई एस हॉलमार्क के साथ, पूरा भरोसा।', 'हॉलमार्क की शुद्धता, आपका भरोसा।']));
  lines.push(
    pick([
      grams && grams <= 3
        ? `${agree(g, 'हल्का', 'हल्की', 'हल्के')} और आरामदायक, रोज़ पहनने के लिए उत्तम।`
        : 'बारीक कारीगरी, बेमिसाल चमक।',
      'उपहार देने के लिए सबसे सुंदर चुनाव।',
      'हर नज़र बस आप पर टिकेगी।',
      'हर मौके के लिए बिलकुल सही।',
    ]),
  );
  lines.push(
    shop
      ? pick([`आज ही पधारें ${shop} पर।`, `केवल ${shop} पर।`, `आज ही आइए ${shop}।`])
      : pick(['आज ही अपनाइए।', 'आज ही हमारे शोरूम पधारें।']),
  );
  return lines;
}

function hinglish(f: Required<AdScriptParts>, pick: Pick): string[] {
  const { metal, purity, grams, hallmarked, shop } = f;
  const [noun, g] = f.hinglish;
  const made = agree(g, 'बना', 'बनी', 'बने');
  const isAre = g === 'pl' ? 'हैं' : 'है';
  const sterling = purity.sterling ? 'स्टर्लिंग ' : '';
  const thing = `${sterling}${metal.hinglish} ${noun}`;
  const lines: string[] = [];
  if (pick([true, true, false])) {
    lines.push(
      pick([
        'कुछ स्पेशल ढूंढ रहे हैं?',
        'हर मौके को बनाइए और भी ख़ास।',
        'स्टाइल भी, एलिगेंस भी।',
        'अब हर दिन होगा स्पेशल।',
        'शादी हो या फेस्टिवल, आपका लुक होगा सबसे अलग।',
      ]),
    );
  }
  const weight = grams
    ? pick([
        `, ${g === 'pl' ? 'जिनका' : 'जिसका'} वेट है सिर्फ़ ${hindiGrams(grams, 'पॉइंट')}।`,
        `, वेट सिर्फ़ ${hindiGrams(grams, 'पॉइंट')}।`,
        `, सिर्फ़ ${hindiGrams(grams, 'पॉइंट')} में।`,
      ])
    : '।';
  const ours = agree(g, 'हमारे नए', 'हमारी नई', 'हमारे नए');
  lines.push(
    pick(
      g === 'pl'
        ? [`पेश हैं ख़ूबसूरत ${thing}`, `देखिए ये शानदार ${thing}`, `मिलिए ${ours} ${thing} से`]
        : [`पेश है एक ख़ूबसूरत ${thing}`, `देखिए यह शानदार ${thing}`, `मिलिए ${ours} ${thing} से`],
    ) + weight,
  );
  if (purity.karat && f.gold) lines.push(`पूरे ${hindiNumber(purity.karat)} कैरेट गोल्ड में ${made} ${isAre}।`);
  else if (purity.fine) lines.push(`प्योर सिल्वर में ${made} ${isAre}।`);
  if (hallmarked)
    lines.push(pick(['बी आई एस हॉलमार्क के साथ, पूरा भरोसा।', 'हॉलमार्क्ड प्योरिटी, जिस पर आप भरोसा कर सकें।']));
  lines.push(
    pick([
      grams && grams <= 3 ? `लाइटवेट और कम्फ़र्टेबल, डेली वियर के लिए परफ़ेक्ट।` : 'डिज़ाइन ऐसा कि हर कोई पूछेगा।',
      'गिफ़्ट के लिए एकदम परफ़ेक्ट।',
      'हर नज़र आप पर ही होगी।',
      'हर ओकेज़न के लिए बिलकुल सही।',
    ]),
  );
  lines.push(
    shop
      ? pick([`आज ही आइए ${shop} पर।`, `सिर्फ़ ${shop} पर।`, `अभी विज़िट करें ${shop}।`])
      : pick(['आज ही इसे अपना बनाइए।', 'आज ही हमारे शोरूम आइए।']),
  );
  return lines;
}

/** Everything the writers (templates and the AI prompt) need, resolved once from the facts. */
export interface AdScriptParts {
  noun: string;
  plural: boolean;
  hi: [string, Gender];
  hinglish: [string, Gender];
  metal: { en: string; hiOf: string; hinglish: string };
  purity: { karat?: number; sterling?: boolean; fine?: boolean };
  grams: number;
  hallmarked: boolean;
  shop: string;
  /** Gold or rose gold: a karat purity can be said. */
  gold: boolean;
}

/** The facts resolved into what the writers say: piece nouns (with Hindi gender), metal words, purity, weight. */
export function adScriptParts(facts: AdScriptFacts): Required<AdScriptParts> {
  const piece = describePiece({ name: facts.itemName, category: facts.categoryName, metal: facts.metalType });
  const byName = describePiece({ name: facts.itemName, metal: `${facts.itemName} ${facts.metalType ?? ''}` });
  const metalKey = byName.metal === 'rose_gold' ? 'rose_gold' : piece.metal;
  const noun = NOUNS[piece.noun] ?? NOUNS['jewellery piece'];
  return {
    noun: noun.en,
    plural: !!noun.plural,
    hi: noun.hi,
    hinglish: noun.hinglish,
    // Unknown metal: nothing is said about it rather than a guess.
    metal: METALS[metalKey] ?? { en: '', hiOf: '', hinglish: '' },
    purity: purityOf(facts.purity, metalKey),
    grams: facts.weightGrams && facts.weightGrams > 0 ? facts.weightGrams : 0,
    hallmarked: !!facts.hallmarked,
    shop: facts.shopName?.trim() ?? '',
    gold: metalKey === 'gold' || metalKey === 'rose_gold',
  };
}

/**
 * A short, natural advertisement voiceover (about 10-15 s) for one inventory item, different on every call: random
 * phrasing and order from hand-written lines, filled only with the item's real facts (piece, metal, purity, weight,
 * hallmark, shop). Numbers are written as words in Hindi and Hinglish so the voice says them naturally.
 * `random` is injectable for tests. Returns the text and the TTS language to speak it in.
 */
export function buildAdScript(
  facts: AdScriptFacts,
  style: AdScriptStyle,
  random: () => number = Math.random,
): { text: string; language: 'en' | 'hi' } {
  const pick: Pick = (options) => options[Math.min(options.length - 1, Math.floor(random() * options.length))];
  const resolved = adScriptParts(facts);
  const lines =
    style === 'en' ? english(resolved, pick) : style === 'hi' ? hindi(resolved, pick) : hinglish(resolved, pick);
  return { text: lines.map(sentence).join(' '), language: style === 'en' ? 'en' : 'hi' };
}
