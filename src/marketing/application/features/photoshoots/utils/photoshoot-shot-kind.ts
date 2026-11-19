/**
 * Base directions for the Kaggle photoshoot pipeline (Qwen3-VL plans and judges, FLUX.2 [klein] 9B paints).
 * Naming the metal and the kind of piece is what keeps the model faithful: without it, a silver chain comes back gold
 * with added diamonds. The four shots mirror a jeweller's ad set: presented by a model, close-up on velvet, gloved
 * hands, and worn.
 */

export const PHOTOSHOOT_SHOT_KINDS = ['present', 'closeup', 'hands', 'worn'] as const;

export type PhotoshootShotKind = (typeof PHOTOSHOOT_SHOT_KINDS)[number];
