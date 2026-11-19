import { PhotoshootPromptOptions } from './photoshoot-prompt-options';
import { PhotoshootShotKind } from './photoshoot-shot-kind';
import { PhotoshootPiece, PhotoshootOutfit, PhotoshootSetting } from '../../../shared';

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
  const detail = [input.name?.trim(), input.purity?.trim()].filter(Boolean).join(', ').slice(0, 120);
  return {
    noun: match?.noun ?? 'jewellery piece',
    wornOn: match?.wornOn ?? 'hand',
    metal,
    detail: detail || undefined,
  };
}

const SETTINGS: Record<PhotoshootSetting, { place: string; surface: string }> = {
  showroom: {
    place:
      'an upscale Indian jewellery showroom with glass display counters and warm golden lights softly blurred behind',
    surface: 'rich black velvet',
  },
  studio: {
    place: 'a clean premium photo studio with a soft beige seamless backdrop and gentle softbox lighting',
    surface: 'smooth ivory silk',
  },
  wedding: {
    place: 'a decorated Indian wedding venue with marigold garlands, fairy lights and warm bokeh',
    surface: 'deep maroon velvet with scattered rose petals',
  },
  festive: {
    place: 'a festive Diwali setting with glowing diyas, a rangoli and warm golden bokeh',
    surface: 'deep red velvet lit by a soft diya glow',
  },
};

const OUTFITS: Record<PhotoshootOutfit, string> = {
  kurta: 'in an elegant pastel kurta',
  saree: 'in a graceful silk saree',
  lehenga: 'in a rich embroidered bridal lehenga with a dupatta',
  western: 'in a chic minimal western dress',
};

/** Prompt for one shot of the set. */
export function buildShotPrompt(
  kind: PhotoshootShotKind,
  piece: PhotoshootPiece,
  options: PhotoshootPromptOptions,
): string {
  const metal = METAL_WORDS[piece.metal] ?? METAL_WORDS.unknown;
  const base = SETTINGS[options.setting] ?? SETTINGS.showroom;
  const setting = WHITE_METALS.has(piece.metal)
    ? { place: neutralLight(base.place), surface: neutralLight(base.surface) }
    : base;
  const man = options.model === 'man';
  const person = man
    ? 'a young Indian man in an elegant kurta'
    : `a young Indian woman ${OUTFITS[options.outfit] ?? OUTFITS.kurta}`;
  const their = man ? 'his' : 'her';
  const it = `this ${metal.word ? `${metal.word} ` : ''}${piece.noun}${piece.detail ? ` (${piece.detail})` : ''}`;
  const keep =
    `Keep the ${piece.noun} exactly as in the reference photo: ${metal.keep}, the same design, motifs, stones, ` +
    'enamel colours and proportions, nothing added or removed, real-life size. Photorealistic, natural skin, real ' +
    'camera photo, sharp focus on the jewellery, no text, no watermark, no logo.';

  switch (kind) {
    case 'present':
      return (
        `Professional jewellery advertisement photo. ${cap(person)}, smiling warmly, stands in ${setting.place} and ` +
        `presents ${it} to the camera, nestled in an open black velvet jewellery box held in both hands close to ${their} chest; framed from the waist up so the piece is large and clearly readable, filling the box at its real size. ${keep}`
      );
    case 'closeup':
      return (
        `Luxury macro close-up product photo of ${it} resting on ${setting.surface}, soft dramatic lighting, crisp ` +
        `sparkle, shallow depth of field, high-end catalogue shot. ${keep}`
      );
    case 'hands':
      return (
        `Close-up photo of hands in white cotton jeweller gloves carefully holding ${it} between the fingertips, ` +
        `the gloves gripping it naturally, over a glass display counter, ${setting.place.replace(/^an? /, 'the ')} out of focus behind. ${keep}`
      );
    case 'worn':
    default:
      return `${wornShot(piece.wornOn, person, their, it, setting.place)} ${keep}`;
  }
}

/** Worn shots: the piece is ON the body (touching skin, real scale), never held up beside the face or floating. */
function wornShot(wornOn: string, person: string, their: string, it: string, place: string): string {
  const real =
    'It is physically worn, resting on the skin with natural contact and a soft shadow, at its real size relative to the body — not held, not floating, not pasted on.';
  switch (wornOn) {
    case 'neck':
      return `Editorial jewellery photo: ${person} wearing ${it} around ${their} neck, lying on ${their} collarbones, portrait from the chest up so the piece is the hero, in ${place}, natural confident smile. ${real}`;
    case 'ears':
      return `Editorial jewellery photo: ${person} wearing ${it} hanging from ${their} earlobes, hair tucked behind the ear, three-quarter portrait so the earrings are clearly visible, in ${place}. ${real}`;
    case 'finger':
      return `Close-up jewellery photo of ${person.replace(/^a /, 'the hand of a ')} wearing ${it} on the ring finger, the band wrapped around the finger, hand resting elegantly on ${their} other hand, in ${place}, soft focus background. ${real}`;
    case 'wrist':
      return `Lifestyle jewellery photo: ${person} wearing ${it} around ${their} wrist — ${their} hand passes through it and it rests on the wrist bone — forearm resting gracefully across ${their} body at chest height so the piece faces the camera, framed from the waist up with ${their} face in the shot, in ${place}, natural smile. ${real}`;
    case 'ankle':
      return `Close-up jewellery photo of the feet of ${person} wearing ${it} around both ankles, graceful pose on a polished floor, in ${place}. ${real}`;
    case 'forehead':
      return `Bridal jewellery portrait: ${person} wearing ${it} on ${their} forehead along the hair parting, close portrait, in ${place}. ${real}`;
    case 'nose':
      return `Close bridal portrait: ${person} wearing ${it} in ${their} nose, soft smile, the piece in sharp focus, in ${place}. ${real}`;
    default:
      return `Lifestyle jewellery photo: ${person} wearing ${it} where it is meant to be worn, the piece clearly visible, in ${place}, natural smile. ${real}`;
  }
}

/** Warm golden light tints silver and platinum gold in the render: keep the light warm but neutral in colour. */
function neutralLight(text: string): string {
  return text.replace(/warm golden (lights?|bokeh)/g, 'soft neutral $1').replace(/golden/g, 'soft');
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
