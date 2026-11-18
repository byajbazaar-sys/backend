/**
 * Base directions for the Kaggle Qwen3-VL + SDXL image-to-image photoshoot pipeline.
 * Naming the metal and the kind of piece is what keeps the model faithful: without it, a silver chain comes back gold
 * with added diamonds. The four shots mirror a jeweller's ad set: presented by a model, close-up on velvet, gloved
 * hands, and worn.
 */

export const PHOTOSHOOT_SHOT_KINDS = ['present', 'closeup', 'hands', 'worn'] as const;

export type PhotoshootShotKind = (typeof PHOTOSHOOT_SHOT_KINDS)[number];
