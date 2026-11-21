import { Occasion } from './instagram-occasions';

/** Caption languages (code → how the model is told to write). */
export const CAPTION_LANGUAGES = {
  en: 'English',
  hi: 'Hindi in Devanagari script',
  hinglish: 'Hinglish (conversational Hindi written in English letters)',
  gu: 'Gujarati in Gujarati script',
  mr: 'Marathi in Devanagari script',
  pa: 'Punjabi in Gurmukhi script',
  bn: 'Bengali in Bengali script',
  ta: 'Tamil in Tamil script',
  te: 'Telugu in Telugu script',
  kn: 'Kannada in Kannada script',
  ml: 'Malayalam in Malayalam script',
} as const;
export type CaptionLanguage = keyof typeof CAPTION_LANGUAGES;
export const CAPTION_LANGUAGE_CODES = Object.keys(CAPTION_LANGUAGES) as CaptionLanguage[];

export const CAPTION_TONES = ['elegant', 'festive', 'playful', 'minimal'] as const;
export type CaptionTone = (typeof CAPTION_TONES)[number];

/** One piece in the post: only facts from the inventory item (or the photoshoot's description of it). */
export interface CaptionPiece {
  name: string;
  category?: string;
  metal?: string;
  purity?: string;
  weightGrams?: number;
  hallmarked?: boolean;
  /** What the photo shows (vision model, English, a few words). */
  look?: string;
}

export interface CaptionFacts {
  shopName: string | null;
  /** Shop address from the business profile (the caption uses the area / city). */
  address: string | null;
  state: string | null;
  pieces: CaptionPiece[];
  /** Number of photos / videos in the post. */
  mediaCount: number;
  hasVideo: boolean;
  occasion: Occasion | null;
}

const MAX_HASHTAGS = 30;
const CAPTION_MAX = 2200;

/** "Shri R K Jewellers" → "ShriRKJewellers". */
export function hashtagWord(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/** The city: the last address part that is not the state, a PIN code or a country. */
export function cityFrom(address: string | null, state: string | null): string | null {
  if (!address) return null;
  const parts = address
    .split(/[,\n]/)
    .map((p) => p.replace(/\b\d{6}\b/g, '').trim())
    .filter(Boolean);
  const skip = (p: string) =>
    (state && p.toLowerCase() === state.toLowerCase()) || /^(india|bharat)$/i.test(p) || /^\d+$/.test(p);
  for (let i = parts.length - 1; i >= 0; i -= 1) if (!skip(parts[i])) return parts[i];
  return null;
}

function describePiece(piece: CaptionPiece): string {
  const facts = [
    piece.category ? `category: ${piece.category}` : null,
    piece.metal ? `metal: ${piece.metal}` : null,
    piece.purity ? `purity: ${piece.purity}` : null,
    piece.weightGrams ? `weight: ${piece.weightGrams} g` : null,
    piece.hallmarked ? 'BIS hallmarked' : null,
    piece.look ? `the photo shows: ${piece.look}` : null,
  ].filter(Boolean);
  return `- ${piece.name}${facts.length ? ` (${facts.join('; ')})` : ''}`;
}

export function captionPrompt(
  facts: CaptionFacts,
  language: CaptionLanguage,
  tone: CaptionTone,
): { system: string; user: string } {
  const city = cityFrom(facts.address, facts.state);
  const system = [
    'You write Instagram captions for an Indian jewellery shop. Reply with JSON only:',
    '{"caption": "<the caption, no hashtags>", "hashtags": ["#tag", ...]}',
    'Rules:',
    `- Write the caption in ${CAPTION_LANGUAGES[language]}.`,
    '- 3 to 6 short lines with line breaks, 2 to 4 fitting emojis, and end with a call to action (visit the store or DM / WhatsApp to enquire).',
    '- Mention the shop name once and where it is (area and city) once.',
    '- Describe the jewellery using ONLY the facts given. Never invent prices, discounts, offers, weights, purity, stones or certifications.',
    '- If a special day is given, weave it in naturally; otherwise do not mention any festival or day.',
    `- 18 to 25 hashtags in English letters: the shop (#${hashtagWord(facts.shopName ?? 'Jewellers')}), the city, the pieces and metal, the special day if any, and popular Indian jewellery tags. No spaces inside a hashtag.`,
  ].join('\n');

  const user = [
    `Shop: ${facts.shopName ?? 'our jewellery store'}`,
    facts.address
      ? `Address: ${facts.address}${facts.state && !facts.address.includes(facts.state) ? `, ${facts.state}` : ''}`
      : null,
    city ? `City: ${city}` : null,
    `Post: ${facts.mediaCount > 1 ? `a carousel of ${facts.mediaCount} ${facts.hasVideo ? 'photos and videos' : 'photos'}` : facts.hasVideo ? 'a reel' : 'one photo'}`,
    facts.pieces.length
      ? `Jewellery:\n${facts.pieces.map(describePiece).join('\n')}`
      : 'Jewellery: (no details — describe it only as beautiful jewellery)',
    facts.occasion ? `Special day: ${facts.occasion.name} (${facts.occasion.angle})` : 'Special day: none',
    `Tone: ${tone}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

export interface CaptionResult {
  caption: string;
  hashtags: string[];
}

/** Hashtags: one word each, deduplicated (case-insensitive), at most `limit`. */
export function cleanHashtags(tags: string[], limit = MAX_HASHTAGS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const word = raw.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!word || /^\d+$/.test(word)) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${word}`);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The model's reply as a caption, or null when it is unusable: not JSON, empty, or it states numbers (weight,
 * purity, prices, discounts) that are not in the facts.
 */
export function parseCaption(reply: string, facts: CaptionFacts): CaptionResult | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  let caption = typeof raw.caption === 'string' ? raw.caption.trim() : '';
  if (!caption) return null;

  // Hashtags the model left in the caption move to the list.
  const inline = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  caption = caption
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  if (!caption || !factsHold(caption, facts)) return null;

  const listed = Array.isArray(raw.hashtags) ? raw.hashtags.filter((t): t is string => typeof t === 'string') : [];
  const brand = facts.shopName ? [`#${hashtagWord(facts.shopName)}`] : [];
  const hashtags = cleanHashtags([...brand, ...listed, ...inline]);
  return { caption: caption.slice(0, CAPTION_MAX), hashtags };
}

/** No invented offers or prices; any weight / purity number must be one of the pieces' own. */
function factsHold(caption: string, facts: CaptionFacts): boolean {
  const latin = caption.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)));
  if (/₹|\brs\.?\s?\d|\binr\b|\d+\s?%|\b(discount|sale|offer|off on)\b/i.test(latin)) return false;
  const weights = facts.pieces.map((p) => p.weightGrams).filter((w): w is number => !!w);
  for (const match of latin.matchAll(/(\d+(?:\.\d+)?)\s?(?:g|gm|gms|gram|grams)\b/gi)) {
    if (!weights.some((w) => Math.abs(w - Number(match[1])) < 0.01)) return false;
  }
  const purities = facts.pieces.map((p) => p.purity?.replace(/\D/g, '')).filter(Boolean);
  for (const match of latin.matchAll(/\b(\d{2,3})\s?(?:k|kt|karat|carat|ct)\b/gi)) {
    if (!purities.includes(match[1])) return false;
  }
  return true;
}

/** A plain caption from the facts alone, when no text model answers (English, Hindi or Hinglish; else English). */
export function templateCaption(facts: CaptionFacts, language: CaptionLanguage): CaptionResult {
  const shop = facts.shopName ?? 'our store';
  const city = cityFrom(facts.address, facts.state);
  const piece = facts.pieces[0];
  // "18K gold Necklace", but not "18K gold Gold Ring" when the name already says the metal.
  const metalWord =
    piece?.metal &&
    piece.metal.toLowerCase() !== 'other' &&
    !piece.name.toLowerCase().includes(piece.metal.toLowerCase())
      ? piece.metal.toLowerCase()
      : null;
  const pieceText = piece ? [piece.purity, metalWord, piece.name].filter(Boolean).join(' ') : 'jewellery';
  const occasion = facts.occasion?.name;
  const lines =
    language === 'hi'
      ? [
          occasion ? `✨ ${occasion} की ख़ुशियों में चमक जोड़िए ✨` : '✨ हर पल को बनाइए ख़ास ✨',
          `${shop} में देखिए हमारा ${pieceText}${piece?.hallmarked ? ' — BIS हॉलमार्क के साथ' : ''}।`,
          city ? `📍 ${shop}, ${city}` : `📍 ${shop}`,
          'आज ही स्टोर पर आइए या WhatsApp पर पूछिए 💬',
        ]
      : language === 'hinglish'
        ? [
            occasion ? `✨ Is ${occasion} kuch khaas pehniye ✨` : '✨ Har pal ko banaiye khaas ✨',
            `${shop} mein dekhiye hamara ${pieceText}${piece?.hallmarked ? ' — BIS hallmark ke saath' : ''}.`,
            city ? `📍 ${shop}, ${city}` : `📍 ${shop}`,
            'Aaj hi store aaiye ya WhatsApp par poochhiye 💬',
          ]
        : [
            occasion ? `✨ Make this ${occasion} shine ✨` : '✨ Crafted to make every moment special ✨',
            `Discover our ${pieceText} at ${shop}${piece?.hallmarked ? ' — BIS hallmarked' : ''}.`,
            city ? `📍 ${shop}, ${city}` : `📍 ${shop}`,
            'Visit us or DM / WhatsApp us to know more 💬',
          ];

  const metal = piece?.metal && piece.metal.toLowerCase() !== 'other' ? hashtagWord(piece.metal) : 'Gold';
  const hashtags = cleanHashtags([
    hashtagWord(shop),
    city ? hashtagWord(city) : '',
    city ? `${hashtagWord(city)}Jewellers` : '',
    piece ? hashtagWord(piece.name) : '',
    piece?.category ? hashtagWord(piece.category) : '',
    `${metal}Jewellery`,
    occasion ? hashtagWord(occasion) : '',
    'Jewellery',
    'IndianJewellery',
    'JewelleryLovers',
    'BridalJewellery',
    'HallmarkedJewellery',
    'TraditionalJewellery',
    'JewelleryDesign',
    'Jewelry',
    'InstaJewellery',
  ]);
  return { caption: lines.join('\n'), hashtags };
}

/** What the vision model is asked about a post photo (English; the caption model translates). */
export const CAPTION_LOOK_PROMPT =
  'This is a jewellery advertisement photo. JSON only: {"piece": "<at most 5 words: what jewellery it is>", ' +
  '"look": "<at most 12 words: design, colours and the mood or setting of the photo>"}. ' +
  'Describe only what you can clearly see.';

/** The vision reply as one short English note, no numbers; stones only when the piece is a diamond item. */
export function parseCaptionLook(reply: string, diamond: boolean): string | undefined {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const clean = (value: unknown, words: number) => {
    const text = (typeof value === 'string' ? value : '')
      .replace(/[^A-Za-z ,-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || /^(none|n\/?a|no)$/i.test(text)) return undefined;
    if (!diamond && /stone|diamond|gem|ruby|emerald|sapphire|kundan|polki/i.test(text)) return undefined;
    return text.split(' ').slice(0, words).join(' ');
  };
  const note = [clean(raw.piece, 5), clean(raw.look, 12)].filter(Boolean).join(' — ');
  return note || undefined;
}
