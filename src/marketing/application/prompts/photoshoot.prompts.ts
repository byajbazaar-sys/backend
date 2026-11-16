import { PhotoshootPiece } from '../domain';
import { PhotoshootModel, PhotoshootOutfit, PhotoshootSetting } from '../enums';

/**
 * Prompts for AI photoshoots (Cloudflare FLUX image-to-image with the product photo as the reference).
 * Naming the metal and the kind of piece is what keeps the model faithful: without it, a silver chain comes back gold
 * with added diamonds. The four shots mirror a jeweller's ad set: presented by a model, close-up on velvet, gloved
 * hands, and worn.
 */

export const PHOTOSHOOT_SHOT_KINDS = ['present', 'closeup', 'hands', 'worn'] as const;
export type PhotoshootShotKind = (typeof PHOTOSHOOT_SHOT_KINDS)[number];

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
};

/** Normalises inventory metal types ("GOLD", "Silver 925", "ROSE_GOLD") to a known key. */
export function normalizeMetal(value?: string | null): string {
  const v = (value ?? '').toLowerCase();
  if (v.includes('rose')) return 'rose_gold';
  if (v.includes('silver')) return 'silver';
  if (v.includes('platinum')) return 'platinum';
  if (v.includes('diamond')) return 'diamond';
  return 'gold';
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
  const detail = [input.name?.trim(), input.purity?.trim()].filter(Boolean).join(', ').slice(0, 120);
  return {
    noun: match?.noun ?? 'jewellery piece',
    wornOn: match?.wornOn ?? 'hand',
    metal: normalizeMetal(input.metal),
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

export interface PhotoshootPromptOptions {
  setting: PhotoshootSetting;
  model: PhotoshootModel;
  outfit: PhotoshootOutfit;
}

/** Prompt for one shot of the set. */
export function buildShotPrompt(
  kind: PhotoshootShotKind,
  piece: PhotoshootPiece,
  options: PhotoshootPromptOptions,
): string {
  const metal = METAL_WORDS[piece.metal] ?? METAL_WORDS.gold;
  const setting = SETTINGS[options.setting] ?? SETTINGS.showroom;
  const man = options.model === 'man';
  const person = man
    ? 'a young Indian man in an elegant kurta'
    : `a young Indian woman ${OUTFITS[options.outfit] ?? OUTFITS.kurta}`;
  const their = man ? 'his' : 'her';
  const it = `this ${metal.word} ${piece.noun}${piece.detail ? ` (${piece.detail})` : ''}`;
  const keep =
    `Keep the ${piece.noun} exactly as in the reference photo: ${metal.keep}, the same design, motifs, stones and ` +
    'colours, nothing added or removed, realistic size. Photorealistic, natural skin, real camera photo, sharp focus ' +
    'on the jewellery, no text, no watermark, no logo.';

  switch (kind) {
    case 'present':
      return (
        `Professional jewellery advertisement photo. ${cap(person)}, smiling warmly, stands in ${setting.place} and ` +
        `presents ${it} to the camera inside an open black velvet jewellery box held in both hands. ${keep}`
      );
    case 'closeup':
      return (
        `Luxury macro close-up product photo of ${it} resting on ${setting.surface}, soft dramatic lighting, crisp ` +
        `sparkle, shallow depth of field, high-end catalogue shot. ${keep}`
      );
    case 'hands':
      return (
        `Close-up photo of hands in white cotton jeweller gloves carefully holding ${it} up over a glass display ` +
        `counter, ${setting.place.replace(/^an? /, 'the ')} out of focus behind. ${keep}`
      );
    case 'worn':
    default:
      return `${wornShot(piece.wornOn, person, their, it, setting.place)} ${keep}`;
  }
}

function wornShot(wornOn: string, person: string, their: string, it: string, place: string): string {
  switch (wornOn) {
    case 'neck':
      return `Editorial jewellery photo: ${person} wearing ${it} around ${their} neck, portrait from the chest up so the piece is the hero, in ${place}, natural confident smile.`;
    case 'ears':
      return `Editorial jewellery photo: ${person} wearing ${it}, hair tucked behind the ear, three-quarter portrait so the earrings are clearly visible, in ${place}.`;
    case 'finger':
      return `Close-up jewellery photo of ${person.replace(/^a /, 'the hand of a ')} wearing ${it} on the ring finger, hand posed elegantly near ${their} face, in ${place}, soft focus background.`;
    case 'wrist':
      return `Lifestyle jewellery photo: ${person} wearing ${it} on ${their} wrist, hand gently raised near ${their} face so it is clearly visible, in ${place}, natural smile.`;
    case 'ankle':
      return `Close-up jewellery photo of the feet of ${person} wearing ${it} on both ankles, graceful pose on a polished floor, in ${place}.`;
    case 'forehead':
      return `Bridal jewellery portrait: ${person} wearing ${it} on ${their} forehead along the hair parting, close portrait, in ${place}.`;
    case 'nose':
      return `Close bridal portrait: ${person} wearing ${it} on ${their} nose, soft smile, the piece in sharp focus, in ${place}.`;
    default:
      return `Lifestyle jewellery photo: ${person} holding ${it} near ${their} face so it is clearly visible, in ${place}, natural smile.`;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
