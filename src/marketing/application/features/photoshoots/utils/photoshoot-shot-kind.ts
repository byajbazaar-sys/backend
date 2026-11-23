/**
 * Base directions for the Kaggle photoshoot pipeline (Qwen3-VL plans and judges, FLUX.2 [klein] 9B paints).
 * Naming the metal and the kind of piece is what keeps the model faithful: without it, a silver chain comes back gold
 * with added diamonds. The four shots mirror a jeweller's catalogue set — and show only the jewellery, never a model
 * or hands: in an open gift box, a close-up on the setting's surface, on the display it is sold on, and a flat lay.
 */

export const PHOTOSHOOT_SHOT_KINDS = ['box', 'closeup', 'display', 'flatlay'] as const;

/** Shots of photoshoots made before marketing became jewellery-only (a model presenting it, gloved hands, worn). */
export const LEGACY_PHOTOSHOOT_SHOT_KINDS = { present: 'box', hands: 'display', worn: 'flatlay' } as const;

export type PhotoshootShotKind = (typeof PHOTOSHOOT_SHOT_KINDS)[number] | keyof typeof LEGACY_PHOTOSHOOT_SHOT_KINDS;

/** The jewellery-only kind a shot is made as now (an old model or hands shot becomes the shot in its place). */
export function productShotKind(kind: string): (typeof PHOTOSHOOT_SHOT_KINDS)[number] {
  const legacy = LEGACY_PHOTOSHOOT_SHOT_KINDS[kind as keyof typeof LEGACY_PHOTOSHOOT_SHOT_KINDS];
  if (legacy) return legacy;
  return (PHOTOSHOOT_SHOT_KINDS as readonly string[]).includes(kind)
    ? (kind as (typeof PHOTOSHOOT_SHOT_KINDS)[number])
    : 'closeup';
}
