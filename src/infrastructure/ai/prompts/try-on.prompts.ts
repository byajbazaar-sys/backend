import type { AiImageInput } from '../interfaces/ai-media.types';
import { orderJewelleryItems } from '../utils/try-on-images.util';

const FACE_HEIGHT_INCHES = 8.5;
const TORSO_HEIGHT_INCHES = 18;
const HAND_WIDTH_INCHES = 3.5;
const WRIST_CIRCUMFERENCE_INCHES = 6.5;
const ANKLE_CIRCUMFERENCE_INCHES = 9;
const NOSE_WIDTH_INCHES = 1.4;

const DESIGN_FIDELITY =
  'DESIGN FIDELITY: Reproduce the jewellery EXACTLY as shown in its reference image — same shape, pattern, colour, finish, stone arrangement, metal work, and overall appearance. Do NOT simplify, stylise, add, or remove any detail from the jewellery design.';

const OCCASION_STYLING: Record<string, string> = {
  Wedding: 'bridal elegance with rich jewel tones',
  Festive: 'festive chic with bold colours',
  Party: 'glamorous evening look with sleek styling',
  Daily: 'casual-chic with understated tones',
  Casual: 'relaxed everyday look with comfortable styling',
};

function occasionStyling(occasion: string): string {
  return OCCASION_STYLING[occasion] ?? `stylish and appropriate for ${occasion}`;
}

function typeKey(type?: string): string {
  return (type || 'other').toLowerCase();
}

function proportionDescription(item: AiImageInput, imageLabel: string): string {
  const type = typeKey(item.type);
  const height = item.heightInInches;
  const typeLabel = item.type || 'jewellery';

  if (!height) {
    return `${imageLabel} shows the ${typeLabel}. Render it at a realistic, proportionate size — not oversized.`;
  }

  if (type.includes('earring')) {
    const percent = Math.round((height / FACE_HEIGHT_INCHES) * 100);
    return `${imageLabel} shows the ${typeLabel} (physical height: ${height} in). PROPORTION LOCK: This earring's height equals EXACTLY ${percent}% of the person's face height (chin-to-crown). Placement: earlobe, hanging straight down. Mirror to BOTH ears if only one reference is shown.`;
  }

  if (type.includes('necklace') || type === 'chain') {
    const percent = Math.round((height / TORSO_HEIGHT_INCHES) * 100);
    return `${imageLabel} shows the ${typeLabel} (physical length: ${height} in). PROPORTION LOCK: Length equals EXACTLY ${percent}% of torso height (chin-to-navel). Placement: centred on neck, draping naturally on the chest.`;
  }

  if (type === 'pendant') {
    const percent = Math.round((height / TORSO_HEIGHT_INCHES) * 100);
    return `${imageLabel} shows the ${typeLabel} (physical height: ${height} in). PROPORTION LOCK: Pendant height equals EXACTLY ${percent}% of torso height. Placement: hanging from a chain at the centre of the chest, resting on skin.`;
  }

  if (type.includes('ring')) {
    const percent = Math.round((height / HAND_WIDTH_INCHES) * 100);
    const hand = type.includes('gents') ? 'appropriate finger on a male hand' : 'ring finger on a female hand';
    return `${imageLabel} shows the ${typeLabel} (band width: ${height} in). PROPORTION LOCK: Ring width equals EXACTLY ${percent}% of hand width. Placement: worn on ${hand}, sitting flush on the finger — not floating.`;
  }

  if (type === 'bracelet') {
    const percent = Math.round((height / WRIST_CIRCUMFERENCE_INCHES) * 100);
    return `${imageLabel} shows the ${typeLabel} (inner diameter: ${height} in). PROPORTION LOCK: Bracelet size equals EXACTLY ${percent}% of wrist circumference. Placement: worn on the wrist, resting naturally on the skin.`;
  }

  if (type === 'payal' || type === 'anklet') {
    const percent = Math.round((height / ANKLE_CIRCUMFERENCE_INCHES) * 100);
    return `${imageLabel} shows the ${typeLabel} (circumference: ${height} in). PROPORTION LOCK: Anklet/payal size equals EXACTLY ${percent}% of ankle circumference. Placement: wrapped around the ankle above the foot, visible if feet/lower legs are in frame.`;
  }

  if (type.includes('nose')) {
    const percent = Math.round((height / NOSE_WIDTH_INCHES) * 100);
    const placement = type.includes('ring')
      ? 'left nostril, sitting flush in the piercing'
      : 'left nostril, pinned to the side of the nose';
    return `${imageLabel} shows the ${typeLabel} (size: ${height} in). PROPORTION LOCK: Nose jewellery equals EXACTLY ${percent}% of nose width. Placement: ${placement}.`;
  }

  return `${imageLabel} shows the ${typeLabel} (physical size: ${height} in). Render at correct proportionate size on the person's body.`;
}

function buildJewelleryImageDescriptions(items: AiImageInput[]): string {
  return items.map((item, index) => proportionDescription(item, `Image ${index + 2}`)).join(' ');
}

function buildSizeRule(items: AiImageInput[]): string {
  const hasHeight = items.some((item) => item.heightInInches);
  if (!hasHeight) {
    return 'Render each jewellery piece at a realistic, proportionate size. Do NOT make any piece oversized or smaller than it would look in real life.';
  }
  return "CRITICAL SIZE RULE — PROPORTION LOCK: The exact anatomical ratios specified in each piece's description above are MANDATORY and must remain identical across ALL variations. Small jewellery MUST look small; large pieces MUST look proportionally large.";
}

function buildCountRule(items: AiImageInput[]): string {
  const types = [...new Set(items.map((item) => (item.type || 'jewellery').toLowerCase()))];
  let rule =
    `Place ONLY the following jewellery piece(s) from the reference images: ${types.join(', ')}. ` +
    'Do NOT add any jewellery not shown in the references. ';

  const hasEarring = types.some((t) => t.includes('earring'));
  if (hasEarring) {
    rule += ' If only one earring reference is shown, mirror it exactly on BOTH earlobes.';
  }

  return rule;
}

function buildPlacementRule(items: AiImageInput[]): string {
  const types = items.map((item) => typeKey(item.type));
  const lines: string[] = [];

  if (types.some((t) => t.includes('necklace') || t === 'chain')) {
    lines.push(' • Necklace/chain: centred on the neck, resting naturally on the upper chest.');
  }
  if (types.some((t) => t === 'pendant')) {
    lines.push(' • Pendant: hanging at the centre of the chest from a chain or cord.');
  }
  if (types.some((t) => t.includes('earring'))) {
    lines.push(' • Earrings: one on each earlobe, symmetrically placed, hanging straight down.');
  }
  if (types.some((t) => t.includes('ring'))) {
    lines.push(' • Ring: worn on the finger, flush against the skin with realistic contact shadows.');
  }
  if (types.some((t) => t === 'bracelet')) {
    lines.push(' • Bracelet: worn on the wrist, following the curve of the arm.');
  }
  if (types.some((t) => t === 'payal' || t === 'anklet')) {
    lines.push(' • Payal/anklet: wrapped around the ankle, visible above the foot.');
  }
  if (types.some((t) => t.includes('nose'))) {
    lines.push(' • Nose pin/ring: on the left nostril, flush against the nose — not floating.');
  }
  if (types.some((t) => t === 'other')) {
    lines.push(' • Other piece: placed where this type of jewellery is normally worn.');
  }

  lines.push(' • Each piece must look physically attached — NOT floating, pasted-on, or misaligned.');
  return lines.join(' ');
}

function buildAivotPromptParts(items: AiImageInput[]) {
  const ordered = orderJewelleryItems(items);

  return {
    ordered,
    imageDescriptions: buildJewelleryImageDescriptions(ordered),
    designFidelity: DESIGN_FIDELITY,
    countRule: buildCountRule(ordered),
    sizeRule: buildSizeRule(ordered),
    placementRule: buildPlacementRule(ordered),
    imageCount: ordered.length + 1,
  };
}

export function buildJewelleryTryOnPrompt(items: AiImageInput[], _opts?: { zeroBased?: boolean }): string {
  const { imageDescriptions, designFidelity, countRule, sizeRule, placementRule, imageCount } =
    buildAivotPromptParts(items);

  return [
    `You are given ${imageCount} images. Image 1 is a photograph of a person. ${imageDescriptions}`,
    'TASK: Produce a photograph of this exact person naturally wearing ONLY the jewellery shown in the reference images. Every other element must be identical to Image 1.',
    'STRICT RULES — follow every rule without exception:',
    '1. FACE & IDENTITY: Copy the face from Image 1 pixel-perfectly — same features, skin tone, expression, and hair. Zero changes.',
    `2. JEWELLERY — DESIGN: ${designFidelity}`,
    `3. JEWELLERY — COUNT: ${countRule}`,
    `4. JEWELLERY — SIZE: ${sizeRule}`,
    `5. JEWELLERY — PLACEMENT: ${placementRule}`,
    '6. PRESERVE EVERYTHING ELSE: Clothing, background, pose, lighting, shadows, and framing must be identical to Image 1.',
    'OUTPUT: Square 1:1, photorealistic, DSLR quality. The result must look like an unedited photograph with only the jewellery naturally added. Do NOT add any text, labels, annotations, measurement indicators, arrows, or overlays of any kind to the image.',
  ].join('\n');
}

export function buildOutfitTryOnPrompt(opts: {
  items: AiImageInput[];
  outfit?: string;
  occasion?: string;
  color?: string;
  zeroBased?: boolean;
}): string {
  const { imageDescriptions, designFidelity, countRule, sizeRule, placementRule, imageCount } = buildAivotPromptParts(
    opts.items,
  );

  const outfit = opts.outfit || 'an elegant outfit';
  const occasion = opts.occasion || 'Portrait';
  const outfitColor = opts.color?.trim();
  const styling = outfitColor ? `appropriate for ${occasion}` : occasionStyling(occasion);
  const colorLock = outfitColor
    ? `OUTFIT COLOUR LOCK: The garment fabric must be exactly ${outfitColor} — match this precise shade with zero deviation. Do NOT substitute a similar, lighter, darker, or complementary colour.`
    : '';
  const colorHint = outfitColor ? '' : 'Choose a colour that naturally complements the occasion and jewellery. ';

  return [
    `You are given ${imageCount} images. Image 1 is a photograph of a specific person. ${imageDescriptions}`,
    `TASK: Produce a ${occasion}-styled portrait of this exact person wearing ONLY the jewellery shown in the reference images.`,
    'STRICT RULES — follow every rule without exception:',
    '1. FACE & IDENTITY: The face MUST be an exact copy of Image 1 — identical bone structure, features, skin tone, and expression. The person must be instantly recognisable. Do NOT alter the face.',
    `2. JEWELLERY — DESIGN: ${designFidelity}`,
    `3. JEWELLERY — COUNT: ${countRule}`,
    `4. JEWELLERY — SIZE: ${sizeRule}`,
    `5. JEWELLERY — PLACEMENT: ${placementRule}`,
    `6. OUTFIT — MANDATORY: The person MUST be dressed in a ${outfit}, ${styling}. ${colorLock}${colorHint}The outfit MUST change to match exactly — do NOT keep the original clothing from Image 1.`,
    '7. HAIR & MAKEUP: Keep hairstyle close to Image 1. Apply only very subtle, minimal makeup — no change to facial features.',
    'OUTPUT: Square 1:1 portrait, photorealistic, DSLR quality. All jewellery must be fully visible and clearly rendered. Premium jewellery catalogue aesthetic. Do NOT add any text, labels, annotations, measurement indicators, arrows, or overlays of any kind to the image.',
  ].join('\n');
}

/** @deprecated Use buildTryOnImageMapPrompt — kept for backwards compatibility */
export function buildReplicateImageMapPrompt(basePrompt: string, _jewelleryItems: AiImageInput[]): string {
  return basePrompt;
}

export function buildFullTryOnPrompt(
  mode: 'jewellery' | 'outfit',
  request: {
    jewelleryItems: AiImageInput[];
    outfit?: string;
    occasion?: string;
    color?: string;
  },
  opts?: { zeroBased?: boolean },
): string {
  if (mode === 'outfit') {
    return buildOutfitTryOnPrompt({
      items: request.jewelleryItems,
      outfit: request.outfit,
      occasion: request.occasion,
      color: request.color,
      zeroBased: opts?.zeroBased,
    });
  }
  return buildJewelleryTryOnPrompt(request.jewelleryItems, opts);
}

export function buildOutfitRecolorPrompt(color: string): string {
  const exactColor = color.trim();
  return [
    `TASK: Recolor ONLY the fabric/textile of the outfit worn by the person in this image to exactly ${exactColor}.`,
    'STRICT PRESERVATION — do NOT change ANY of the following:',
    "(1) The person's identity — facial features, skin tone, hair colour, hair style, and hair texture must remain exactly as in the original.",
    '(2) The jewellery — every piece must remain identical in design, colour, finish, and placement.',
    '(3) The background — scenery, colours, objects, and lighting must stay exactly the same.',
    "(4) The outfit's style, cut, fabric texture, pattern/print layout, and fit — only the colour changes, not the garment design.",
    '(5) The image composition and framing — maintain the exact same crop and aspect ratio.',
    `RECOLOR RULE: Apply exactly ${exactColor} uniformly across the entire outfit's fabric. Do NOT use a substitute shade. Preserve realistic fabric shading, highlights, and shadows so the cloth looks naturally lit.`,
    `OUTPUT: A single high-quality, photorealistic image that looks like the original photograph with only the outfit's colour changed to exactly ${exactColor}. Nothing else should look different. Do NOT add any text, labels, annotations, measurement indicators, arrows, or overlays of any kind to the image.`,
  ].join(' ');
}
