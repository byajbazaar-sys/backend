import { PhotoshootPromptOptions } from './photoshoot-prompt-options';
import { PhotoshootShotKind, productShotKind } from './photoshoot-shot-kind';
import { PhotoshootPiece, PhotoshootSetting } from '../../../shared';

/** Keyword → piece. Order matters ("earring" before "ring", "pendant set" before "pendant"). */
const PIECES: { words: RegExp; noun: string; wornOn: string }[] = [
  {
    words: /ear\s?rings?|jhumk|bali\b|balis|tops\b|studs?\b|chandbali|kundal|karn ?phool/,
    noun: 'pair of earrings',
    wornOn: 'ears',
  },
  { words: /mangal\s?sutra/, noun: 'mangalsutra', wornOn: 'neck' },
  { words: /choker/, noun: 'choker necklace', wornOn: 'neck' },
  { words: /necklace|haar\b|har\b|rani\s?haar|neck|hasli|guttapusalu|kanthi/, noun: 'necklace', wornOn: 'neck' },
  { words: /pendant|locket/, noun: 'pendant', wornOn: 'neck' },
  { words: /maang\s?tikk?a|tikk?a\b|matha\s?patti|borla/, noun: 'maang tikka', wornOn: 'forehead' },
  { words: /nose|nath\b|nathni|laung/, noun: 'nose ring', wornOn: 'nose' },
  { words: /anklet|payal|pajeb|ankle|paayal/, noun: 'pair of anklets', wornOn: 'ankle' },
  { words: /\bkada\b|\bkara\b|kadas/, noun: 'kada (thick bangle)', wornOn: 'wrist' },
  { words: /bangle|kangan|chudi|churi|chooda/, noun: 'bangle', wornOn: 'wrist' },
  { words: /bracelet/, noun: 'bracelet', wornOn: 'wrist' },
  { words: /\bchains?\b/, noun: 'chain', wornOn: 'neck' },
  { words: /\brings?\b|anguthi|angoothi|\bband\b|solitaire/, noun: 'ring', wornOn: 'finger' },
];

const METAL_WORDS: Record<string, { word: string; keep: string }> = {
  gold: { word: 'gold', keep: 'yellow GOLD metal with the same warm tone' },
  silver: { word: 'silver', keep: 'polished SILVER metal (not gold)' },
  rose_gold: { word: 'rose gold', keep: 'ROSE GOLD metal with the same pinkish tone' },
  platinum: { word: 'platinum', keep: 'white PLATINUM metal (not yellow gold)' },
  diamond: { word: 'diamond', keep: 'the same metal colour and the same diamonds' },
  /** Not known from the item or the form: the notebook's analyst reads the metal from the photo instead. */
  unknown: {
    word: '',
    keep: 'the exact metal colour seen in the reference photo (never turn silver into gold or gold into silver)',
  },
};

/** Silver-coloured metals: warm golden light in the scene pushes the image model to repaint them gold. */
const WHITE_METALS = new Set(['silver', 'platinum']);

/**
 * Normalises inventory metal types ("GOLD", "Silver 925", "ROSE_GOLD", "चांदी") to a known key; 'unknown' when it
 * can't tell — never a guess, because naming the wrong metal is what turns a silver piece gold.
 */
export function normalizeMetal(value?: string | null): string {
  const v = (value ?? '').toLowerCase();
  if (v.includes('rose')) return 'rose_gold';
  if (/silver|chandi|chaandi|चांदी|\b925\b|sterling/.test(v)) return 'silver';
  if (v.includes('platinum')) return 'platinum';
  if (v.includes('diamond')) return 'diamond';
  if (/gold|sona|सोना|\b(14|18|20|22|24)\s?k/.test(v)) return 'gold';
  return 'unknown';
}

/** Works out what the piece is from the item's name / category (Hindi names included). */
export function describePiece(input: {
  name?: string | null;
  category?: string | null;
  metal?: string | null;
  purity?: string | null;
}): PhotoshootPiece {
  const text = `${input.name ?? ''} ${input.category ?? ''}`.toLowerCase();
  const match = PIECES.find((p) => p.words.test(text));
  // The form's metal wins; otherwise the item name may say it ("silver kada").
  const metal = normalizeMetal(input.metal) === 'unknown' ? normalizeMetal(text) : normalizeMetal(input.metal);
  const noun = match?.noun ?? 'jewellery piece';
  // The prompt reads "this silver chain (<detail>)": a name that only repeats the noun and metal ("chain chain") adds
  // nothing, and a bare purity number ("70") means nothing to the image model — only a karat ("22K") says the tone.
  const name = uniqueWords(input.name ?? '');
  const known = new Set(`${noun} ${METAL_WORDS[metal]?.word ?? ''}`.toLowerCase().split(/[\s()]+/));
  const telling = name
    .toLowerCase()
    .split(/\s+/)
    .some((word) => word && !known.has(word));
  const purity = /\d\s*(k|kt|karat|carat)\b/i.test(input.purity ?? '') ? input.purity.trim() : '';
  const detail = [telling ? name : '', purity].filter(Boolean).join(', ').slice(0, 120);
  return {
    noun,
    wornOn: match?.wornOn ?? 'hand',
    metal,
    detail: detail || undefined,
  };
}

/** "chain chain" → "chain", "ring Gents Ring" → "Gents Ring": the piece type + item name often repeat a word; the
 * last copy is kept, so the item's own name reads as written. */
function uniqueWords(text: string): string {
  const seen = new Set<string>();
  return text
    .trim()
    .split(/\s+/)
    .reverse()
    .filter((word) => word && !seen.has(word.toLowerCase()) && seen.add(word.toLowerCase()))
    .reverse()
    .join(' ');
}

/** Where the set is shot: background, the surface a piece lies on, what a box / display stands on, flat-lay props. */
const SETTINGS: Record<
  PhotoshootSetting,
  { place: string; surface: string; counter: string; props: string; box: string }
> = {
  showroom: {
    place:
      'an upscale Indian jewellery showroom with empty glass display counters and warm golden lights softly blurred behind',
    surface: 'spotless smooth black velvet',
    counter: 'a polished glass display counter',
    props: 'a few loose pearls and a folded silk ribbon',
    box: 'black velvet',
  },
  studio: {
    place: 'a clean premium photo studio with a soft beige seamless backdrop and gentle softbox lighting',
    surface: 'smooth ivory silk',
    counter: 'a matte ivory plinth',
    props: "a sprig of baby's breath and a soft silk fold",
    box: 'ivory velvet',
  },
  wedding: {
    place: 'a decorated Indian wedding venue with marigold garlands, fairy lights and warm bokeh',
    surface: 'spotless deep maroon velvet with scattered rose petals',
    counter: 'a carved wooden table draped in maroon silk',
    props: 'rose petals and a few marigold flowers',
    box: 'deep maroon velvet',
  },
  festive: {
    place: 'a festive Diwali setting with glowing diyas, a rangoli and warm golden bokeh',
    surface: 'spotless deep red velvet lit by a soft diya glow',
    counter: 'a polished brass tray',
    props: 'marigold petals and a small lit diya',
    box: 'red velvet',
  },
};

/** The display each kind of piece is sold on (a bust only holds neck pieces). */
const DISPLAYS: Record<string, string> = {
  neck: 'a velvet jewellery bust',
  ears: 'a velvet earring stand',
  finger: 'a velvet ring cone',
  wrist: 'a velvet bangle stand',
  ankle: 'a low velvet display tray',
  forehead: 'a velvet display tray',
  nose: 'a small velvet display tray',
};

/** Marketing shows the jewellery only: no model, no hands. */
const ONLY_JEWELLERY =
  'Only the jewellery from the product photo and its own display are in the photo: no other jewellery in the ' +
  'background or around it, no people, no mannequins, no hands, no body parts.';

/** Prompt for one shot of the set (an old model, hands or worn shot is made as the jewellery-only shot in its place). */
export function buildShotPrompt(
  kind: PhotoshootShotKind,
  piece: PhotoshootPiece,
  options: PhotoshootPromptOptions,
): string {
  const metal = METAL_WORDS[piece.metal] ?? METAL_WORDS.unknown;
  const base = SETTINGS[options.setting] ?? SETTINGS.showroom;
  const setting = WHITE_METALS.has(piece.metal)
    ? { ...base, place: neutralLight(base.place), surface: neutralLight(base.surface) }
    : base;
  const it = `this ${metal.word ? `${metal.word} ` : ''}${piece.noun}${piece.detail ? ` (${piece.detail})` : ''}`;
  const keep =
    `Keep the ${piece.noun} exactly as in the reference photo: ${metal.keep}, the same design, motifs, stones, ` +
    'enamel colours and proportions, nothing added or removed, real-life size. Photorealistic, real camera photo, ' +
    'sharp focus on the jewellery, no text, no watermark, no logo.';

  switch (productShotKind(kind)) {
    case 'box':
      return (
        `Luxury jewellery product photo of ${it} nestled in an open ${setting.box} jewellery box lined with satin, ` +
        `the box standing on ${setting.counter} in ${setting.place}, softly out of focus behind; the piece large and ` +
        `clearly readable, filling the box at its real size. ${ONLY_JEWELLERY} ${keep}`
      );
    case 'display':
      return (
        `Elegant jewellery display photo of ${it} on ${DISPLAYS[piece.wornOn] ?? 'a velvet display tray'}, set on ` +
        `${setting.counter} in ${setting.place}, the background softly out of focus; the piece centred, large and ` +
        `clearly readable at its real size. ${ONLY_JEWELLERY} ${keep}`
      );
    case 'flatlay':
      return (
        `Styled flat lay photographed from directly above: ${it} lying flat on ${setting.surface} with ` +
        `${setting.props} arranged around it, soft even light, a clean premium composition with the piece at the ` +
        `centre. ${ONLY_JEWELLERY} ${keep}`
      );
    case 'closeup':
    default:
      return (
        `Luxury macro close-up product photo of ${it} resting on ${setting.surface}, soft dramatic lighting, crisp ` +
        `sparkle, shallow depth of field, high-end catalogue shot. ${ONLY_JEWELLERY} ${keep}`
      );
  }
}

/** Warm golden light tints silver and platinum gold in the render: keep the light warm but neutral in colour. */
function neutralLight(text: string): string {
  return text.replace(/warm golden (lights?|bokeh)/g, 'soft neutral $1').replace(/golden/g, 'soft');
}
