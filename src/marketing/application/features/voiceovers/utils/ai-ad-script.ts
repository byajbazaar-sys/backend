import { adScriptParts } from './ad-script';
import { AdScriptFacts } from './ad-script-facts';
import { AdScriptStyle } from './ad-script-style';
import { hindiGrams, hindiNumber } from './hindi-number-words';
import { ProductLook } from './product-look';

const ANGLES = [
  'the wedding season',
  'everyday elegance',
  'the perfect gift for someone special',
  'festive shine',
  'timeless tradition',
  'modern, light style',
  'a little treat for yourself',
  'a family celebration',
];
const TONES = ['warm and friendly', 'luxurious and graceful', 'bright and energetic', 'emotional and heartfelt'];

/** Words that make a claim the inventory cannot back (prices, offers, delivery …): never allowed in a script. */
const NEVER_EN = /₹|%|\b(rs\.?|rupees?|price|prices|discount|offer|sale|free|emi|delivery|cashback|lowest|cheapest)\b/i;
/**
 * The same in Hindi, matched as whole words: JavaScript's \b does not work for Devanagari, and a substring test
 * would reject "सेलिब्रेशन" for "सेल". Stems of 4+ letters also match their inflections (कीमतों, रुपयों).
 */
const NEVER_HI = [
  'रुपय',
  'रुपए',
  'रुपये',
  'रुपया',
  'कीमत',
  'दाम',
  'प्राइस',
  'डिस्काउंट',
  'ऑफ़र',
  'ऑफर',
  'छूट',
  'मुफ़्त',
  'मुफ्त',
  'फ्री',
  'फ़्री',
  'सेल',
  'डिलीवरी',
];

function makesClaim(text: string): boolean {
  if (NEVER_EN.test(text)) return true;
  const words = text.split(/[\s,.!?।'"()-]+/).filter(Boolean);
  return words.some((w) => NEVER_HI.some((stem) => w === stem || (stem.length >= 4 && w.startsWith(stem))));
}

/** What the facts allow the script to say, in the words the voice must use. */
function allowed(facts: AdScriptFacts, style: AdScriptStyle) {
  const parts = adScriptParts(facts);
  const hinglish = style === 'hinglish';
  const pieceWord = style === 'en' ? parts.noun : style === 'hi' ? parts.hi[0] : parts.hinglish[0];
  const metalWord = style === 'en' ? parts.metal.en : style === 'hi' ? parts.metal.hiOf : parts.metal.hinglish;
  const karat = parts.gold && parts.purity.karat ? parts.purity.karat : undefined;
  return {
    parts,
    piece: pieceWord,
    metal: metalWord,
    weight: parts.grams
      ? style === 'en'
        ? `${Math.round(parts.grams * 100) / 100} ${parts.grams === 1 ? 'gram' : 'grams'}`
        : hindiGrams(parts.grams, hinglish ? 'पॉइंट' : 'दशमलव')
      : '',
    karat: karat ? (style === 'en' ? `${karat} karat` : `${hindiNumber(karat)} कैरेट`) : '',
    sterling: parts.purity.sterling,
    hallmarked: parts.hallmarked,
    shop: parts.shop,
  };
}

/**
 * The system and user messages for one ad script. A random angle and tone per call keeps every version different;
 * the facts are listed in the exact words the voice must say (numbers already as words for Hindi), and anything
 * not listed is forbidden.
 */
export function adScriptPrompt(
  facts: AdScriptFacts,
  style: AdScriptStyle,
  random: () => number = Math.random,
  look: ProductLook = {},
): { system: string; user: string } {
  const a = allowed(facts, style);
  const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];
  const language =
    style === 'en'
      ? 'English. Simple, warm Indian English.'
      : style === 'hi'
        ? 'Hindi — natural spoken Hindi, written ONLY in Devanagari script. No English letters, no digits: every number in Hindi words.'
        : 'Hinglish — everyday Hindi mixed with common English words (gold, ring, design, style, perfect, gift, weight), written ENTIRELY in Devanagari script, like "पेश है एक ख़ूबसूरत गोल्ड रिंग, जिसका वेट है सिर्फ़ एक ग्राम।" No English letters, no digits: every number in Hindi words.';
  const lines = [
    `piece: ${a.piece}`,
    a.metal ? `metal: ${a.metal}` : 'metal: do not mention the metal',
    a.karat
      ? `purity: ${a.karat} (say exactly "${a.karat}")`
      : a.sterling
        ? 'purity: sterling silver'
        : 'purity: do not mention purity or karat',
    a.weight ? `weight: ${a.weight} (say exactly "${a.weight}")` : 'weight: do not mention weight',
    a.hallmarked ? 'BIS hallmarked: yes (you may mention the hallmark)' : 'hallmark: do not mention any hallmark',
    a.shop
      ? `shop name: ${a.shop} (say exactly "${a.shop}", once, in the closing call to visit)`
      : 'shop name: none — close with a call to visit the store',
  ];
  const seen = [look.design, look.details].filter(Boolean).join('; ');
  if (seen) lines.push(`its look (seen on the product photo — describe it in the script's language): ${seen}`);
  return {
    system:
      'You write short, catchy advertisement voiceovers for an Indian jewellery shop, to be read aloud by a text-to-speech voice. ' +
      'Reply with ONLY the voiceover text: no title, no quotes, no labels, no emojis, no hashtags, no stage directions.',
    user:
      `Write a fresh ad of 30 to 55 words in 3 to 5 short sentences.\nLanguage: ${language}\n` +
      `Use ONLY these facts and never invent others (no price, discount, offer, stones, delivery, guarantee or comparison):\n- ${lines.join('\n- ')}\n` +
      `Angle for this version: ${pick(ANGLES)}. Tone: ${pick(TONES)}. Start differently from a plain "Presenting".`,
  };
}

/**
 * The model's reply as a speakable script, or null when it breaks a rule: wrong script (Latin / digits in Hindi),
 * a required fact missing or changed, a claim the facts don't allow, or the wrong length.
 */
export function checkAdScript(reply: string, facts: AdScriptFacts, style: AdScriptStyle): string | null {
  const a = allowed(facts, style);
  let text = String(reply ?? '')
    .replace(/^\s*(voice[- ]?over|script|ad|here(?:'s| is)[^:\n]*)\s*:\s*/i, '')
    .replace(/["“”«»*#_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const words = text.split(' ').length;
  if (words < 15 || words > 95) return null;
  if (makesClaim(text)) return null;
  // A stutter ("आकर आकर देखें") sounds broken when spoken.
  if (/(?:^|\s)(\S{3,})\s+\1(?=[\s,.!?।]|$)/u.test(text)) return null;
  const hindiStyle = style !== 'en';
  if (hindiStyle) {
    // The shop name is checked (and may be any script) separately; everything else must be Devanagari.
    const rest = a.shop ? text.split(a.shop).join(' ') : text;
    if (/[A-Za-z0-9०-९]/.test(rest)) return null;
  } else {
    const digits = text.match(/\d+(?:\.\d+)?/g) ?? [];
    const ok = new Set([String(Math.round(a.parts.grams * 100) / 100), String(a.parts.purity.karat ?? '')]);
    if (digits.some((d) => !ok.has(d))) return null;
  }
  if (a.weight && !text.includes(a.weight)) return null;
  if (a.karat && !text.includes(a.karat)) return null;
  if (!a.karat && /karat|carat|कैरेट|केरेट/i.test(text)) return null;
  if (!a.hallmarked && /hallmark|हॉलमार्क|हालमार्क/i.test(text)) return null;
  if (a.shop && !text.includes(a.shop)) return null;
  if (a.parts.metal.en !== 'diamond' && /diamond|डायमंड|हीरा|हीरे|stone|स्टोन/i.test(text)) return null;
  if (!/[.!?।]$/.test(text)) text += style === 'en' ? '.' : '।';
  return text;
}
