import { hindiGrams, hindiNumber } from '@shared-libs';

/**
 * What the assistant says out loud, and which voice says it:
 *  - English → Cloudflare's Aura-2 (fast);
 *  - Hindi / Marathi in Devanagari → ChatterBox on the warm Kaggle workers (the Voice studio's engine), with numbers,
 *    rupees, grams and percent written as Hindi words; when no worker is free the gateway shows it as text;
 *  - Gujarati, and Hinglish in Latin letters → shown as text (no voice reads them well).
 * Spoken text is short and free of symbols a voice would read oddly.
 */

export interface SpeechPlan {
  speak: boolean;
  text: string;
  /** aura: Cloudflare (English) · chatterbox: the Kaggle voice lane (Hindi). */
  engine?: 'aura' | 'chatterbox';
  language?: 'en' | 'hi';
  /** Why it is not spoken. */
  reason?: 'muted' | 'not_english' | 'empty';
}

/** Common Hindi words in Latin script; a reply full of them is Hinglish, which an English voice mispronounces. */
const HINGLISH_MARKERS = new Set([
  'hai',
  'hain',
  'ka',
  'ki',
  'ke',
  'ko',
  'se',
  'mein',
  'aur',
  'kya',
  'nahi',
  'nahin',
  'karo',
  'kare',
  'karein',
  'kijiye',
  'batayein',
  'bataiye',
  'bataye',
  'chahiye',
  'wala',
  'wali',
  'wale',
  'raha',
  'rahi',
  'gaya',
  'gayi',
  'diya',
  'liya',
  'hua',
  'hoga',
  'hogi',
  'tha',
  'thi',
  'aap',
  'apna',
  'apne',
  'yeh',
  'woh',
  'jaise',
  'bhi',
  'toh',
  'kitna',
  'kitni',
  'kaun',
  'kahan',
  'kab',
  'liye',
  'abhi',
  'dijiye',
  'dabaiye',
  'kholiye',
  'chuniye',
  'baaki',
  'byaj',
  'jama',
  'girvi',
  'dena',
  'lena',
  'ho',
  'hum',
  'tum',
  'unka',
  'iska',
  'uska',
  'sab',
  'sirf',
  'theek',
]);

export function isEnglishForSpeech(text: string): boolean {
  if (/[ऀ-ॿ઀-૿਀-੿]/.test(text)) return false;
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (!words.length) return false;
  const markers = words.filter((w) => HINGLISH_MARKERS.has(w)).length;
  return markers < 2 && markers / words.length < 0.12;
}

/** Symbols and formatting an English voice would read badly, and a length cap at a sentence boundary. */
export function toSpeakableText(text: string, maxChars: number): string {
  let out = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/₹\s?([\d,]+(?:\.\d+)?)/g, '$1 rupees')
    .replace(/₹/g, 'rupees')
    .replace(/(\d)\s?g\b/g, '$1 grams')
    .replace(/(\d)\s?%/g, '$1 percent')
    .replace(/\b(\d{2})\s?K\b/g, '$1 karat')
    .replace(/&/g, ' and ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();
  if (out.length <= maxChars) return out;
  const cut = out.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  out = end > maxChars * 0.4 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' ')).trim()}…`;
  return out;
}

/** Amounts the Indian way, in Hindi words: 150000 → "एक लाख पचास हज़ार". */
export function hindiAmount(n: number): string {
  let value = Math.round(Math.abs(n));
  if (value < 10_000) return hindiNumber(value);
  const parts: string[] = [];
  for (const [size, word] of [
    [10_000_000, 'करोड़'],
    [100_000, 'लाख'],
    [1_000, 'हज़ार'],
  ] as const) {
    const count = Math.floor(value / size);
    if (count) parts.push(`${count < 10_000 ? hindiNumber(count) : String(count)} ${word}`);
    value %= size;
  }
  if (value) parts.push(hindiNumber(value));
  return parts.join(' ');
}

function hindiDecimal(raw: string): string {
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n)) return raw;
  if (Number.isInteger(n)) return hindiAmount(n);
  const [whole, frac] = n.toFixed(2).replace(/0+$/, '').split('.');
  return `${hindiAmount(Number(whole))} दशमलव ${[...frac].map((d) => hindiNumber(Number(d))).join(' ')}`;
}

/** Hindi text for ChatterBox: symbols out, numbers as Hindi words, cut at a sentence. */
export function toHindiSpeech(text: string, maxChars: number): string {
  let out = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/₹\s?([\d,]+(?:\.\d+)?)/g, (_, n: string) => `${hindiDecimal(n)} रुपये`)
    .replace(/(\d+(?:\.\d+)?)\s?(?:g|gm|gms|gram|grams|ग्राम)(?![\p{L}])/gu, (_, n: string) => hindiGrams(Number(n)))
    .replace(/(\d+(?:\.\d+)?)\s?%/g, (_, n: string) => `${hindiDecimal(n)} प्रतिशत`)
    .replace(/\b(\d{2})\s?K\b/g, (_, n: string) => `${hindiNumber(Number(n))} कैरेट`)
    .replace(/\d[\d,]*(?:\.\d+)?/g, (n) => hindiDecimal(n))
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s*\n+\s*/g, '। ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf('। '), cut.lastIndexOf('. '), cut.lastIndexOf('? '));
    out = end > maxChars * 0.4 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')).trim();
  }
  return out;
}

export function speechFor(
  reply: string,
  options: { speakReplies: boolean; maxChars: number; multilingual?: boolean },
): SpeechPlan {
  const text = (reply ?? '').trim();
  if (!text) return { speak: false, text: '', reason: 'empty' };
  if (!options.speakReplies) return { speak: false, text: '', reason: 'muted' };
  if (/[\u0A80-\u0AFF]/.test(text)) return { speak: false, text: '', reason: 'not_english' };
  if (/[\u0900-\u097F]/.test(text)) {
    if (!options.multilingual) return { speak: false, text: '', reason: 'not_english' };
    const spoken = toHindiSpeech(text, options.maxChars);
    return spoken
      ? { speak: true, text: spoken, engine: 'chatterbox', language: 'hi' }
      : { speak: false, text: '', reason: 'empty' };
  }
  if (!isEnglishForSpeech(text)) return { speak: false, text: '', reason: 'not_english' };
  const spoken = toSpeakableText(text, options.maxChars);
  return spoken
    ? { speak: true, text: spoken, engine: 'aura', language: 'en' }
    : { speak: false, text: '', reason: 'empty' };
}
