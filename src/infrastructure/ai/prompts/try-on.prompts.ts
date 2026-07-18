import type { AiImageInput } from '../interfaces/ai-media.types';
import { orderJewelleryItems } from '../utils/try-on-images.util';

const FACE_HEIGHT_INCHES = 8.5;
const TORSO_HEIGHT_INCHES = 18;

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

function buildJewelleryImageDescriptions(items: AiImageInput[]): string {
  return items
    .map((item, index) => {
      const imageLabel = `Image ${index + 2}`;
      const type = item.type || 'jewellery';

      if (!item.heightInInches) {
        return `${imageLabel} shows the ${type}. Render it at a realistic, proportionate size — not oversized.`;
      }

      const height = item.heightInInches;
      const typeLower = type.toLowerCase();

      if (typeLower.includes('earring')) {
        const percent = Math.round((height / FACE_HEIGHT_INCHES) * 100);
        return `${imageLabel} shows the ${type} (physical height: ${height} in). PROPORTION LOCK: This earring's height equals EXACTLY ${percent}% of the person's face height (measured chin-to-crown). In the output image, find the person's face height in pixels, then make the earring EXACTLY ${percent}% of that pixel count — no more, no less. Placement: earlobe, hanging straight down. This ratio MUST be identical for every generated image of this person.`;
      }

      if (typeLower.includes('necklace')) {
        const percent = Math.round((height / TORSO_HEIGHT_INCHES) * 100);
        return `${imageLabel} shows the ${type} (physical height: ${height} in, measured from collarbone top down to the lowest pendant/tassel tip). PROPORTION LOCK: This necklace height equals EXACTLY ${percent}% of the person's torso height (measured chin-to-navel). In the output image, find the person's torso height in pixels, then make the necklace EXACTLY ${percent}% of that pixel count — no more, no less. Placement: centred on the neck, hanging straight down onto the chest. This ratio MUST be identical for every generated image of this person.`;
      }

      return `${imageLabel} shows the ${type} (physical height: ${height} in). Render it at the correct proportionate size on the person's body.`;
    })
    .join(' ');
}

function buildSizeRule(items: AiImageInput[]): string {
  const hasHeight = items.some((item) => item.heightInInches);
  if (!hasHeight) {
    return 'Render each jewellery piece at a realistic, proportionate size. Do NOT make any piece oversized or smaller than it would look in real life.';
  }

  const parts: string[] = [];
  if (items.some((item) => item.type?.toLowerCase().includes('earring') && item.heightInInches)) {
    parts.push('the exact earring-to-face-height % already specified above');
  }
  if (items.some((item) => item.type?.toLowerCase().includes('necklace') && item.heightInInches)) {
    parts.push('the exact necklace-to-torso-height % already specified above');
  }

  return `CRITICAL SIZE RULE — PROPORTION LOCK: The exact anatomical ratios specified in each piece's description above are MANDATORY. Express sizing as: ${parts.join(' and ')}. These percentage ratios are the SAME across ALL variations of this image — do NOT resize any jewellery piece based on scene context, outfit, or framing. Small jewellery MUST look small; large pendants MUST look proportionally large.`;
}

function buildCountRule(items: AiImageInput[]): string {
  const hasEarring = items.some((item) => item.type?.toLowerCase().includes('earring'));
  const hasNecklace = items.some((item) => item.type?.toLowerCase().includes('necklace'));
  const types = [...new Set(items.map((item) => (item.type || 'jewellery').toLowerCase()))];

  let rule =
    `Place ONLY the following jewellery piece(s) provided in the reference image(s): ${types.join(' and ')}. ` +
    'Do NOT add any other accessory — no garlands, maangtika, bangles, rings, ';

  if (hasEarring && !hasNecklace) {
    rule += 'necklace, ';
  }
  if (hasNecklace && !hasEarring) {
    rule += 'earrings, ';
  }

  rule += 'or any item not explicitly shown in the reference images.';

  if (hasEarring) {
    rule += ' If only one earring is shown, mirror it exactly and place one on EACH earlobe.';
  }

  return rule;
}

function buildPlacementRule(items: AiImageInput[]): string {
  const hasEarring = items.some((item) => item.type?.toLowerCase().includes('earring'));
  const hasNecklace = items.some((item) => item.type?.toLowerCase().includes('necklace'));
  const lines: string[] = [];

  if (hasNecklace) {
    lines.push(
      ' • Necklace: centred on the neck, resting naturally on the upper chest with the chain lying against the skin.',
    );
  }
  if (hasEarring) {
    lines.push(' • Earrings: one on each earlobe, hanging straight down, symmetrically placed.');
  }
  lines.push(
    ' • Each piece must look physically attached to the body — NOT floating, pasted-on, or misaligned.',
  );

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

export function buildJewelleryTryOnPrompt(
  items: AiImageInput[],
  _opts?: { zeroBased?: boolean },
): string {
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
  const { imageDescriptions, designFidelity, countRule, sizeRule, placementRule, imageCount } =
    buildAivotPromptParts(opts.items);

  const outfit = opts.outfit || 'an elegant outfit';
  const occasion = opts.occasion || 'Portrait';
  const styling = occasionStyling(occasion);
  const colorSuffix = opts.color ? ` in ${opts.color} color` : '';
  const colorHint = opts.color
    ? ''
    : 'Choose a colour that naturally complements the occasion and jewellery. ';

  return [
    `You are given ${imageCount} images. Image 1 is a photograph of a specific person. ${imageDescriptions}`,
    `TASK: Produce a ${occasion}-styled portrait of this exact person wearing ONLY the jewellery shown in the reference images.`,
    'STRICT RULES — follow every rule without exception:',
    '1. FACE & IDENTITY: The face MUST be an exact copy of Image 1 — identical bone structure, features, skin tone, and expression. The person must be instantly recognisable. Do NOT alter the face.',
    `2. JEWELLERY — DESIGN: ${designFidelity}`,
    `3. JEWELLERY — COUNT: ${countRule}`,
    `4. JEWELLERY — SIZE: ${sizeRule}`,
    `5. JEWELLERY — PLACEMENT: ${placementRule}`,
    `6. OUTFIT — MANDATORY: The person MUST be dressed in a ${outfit}${colorSuffix}, styled for ${occasion} (${styling}). This is not optional — the outfit MUST change to match exactly this description. ${colorHint}Do NOT keep the original clothing from Image 1.`,
    '7. HAIR & MAKEUP: Keep hairstyle close to Image 1. Apply only very subtle, minimal makeup — no change to facial features.',
    'OUTPUT: Square 1:1 portrait, photorealistic, DSLR quality. All jewellery must be fully visible and clearly rendered. Premium jewellery catalogue aesthetic. Do NOT add any text, labels, annotations, measurement indicators, arrows, or overlays of any kind to the image.',
  ].join('\n');
}

/** @deprecated Use buildTryOnImageMapPrompt — kept for backwards compatibility */
export function buildReplicateImageMapPrompt(
  basePrompt: string,
  _jewelleryItems: AiImageInput[],
): string {
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
  return [
    `TASK: Recolor ONLY the fabric/textile of the outfit worn by the person in this image to ${color}.`,
    'STRICT PRESERVATION — do NOT change ANY of the following:',
    "(1) The person's identity — facial features, skin tone, hair colour, hair style, and hair texture must remain exactly as in the original.",
    '(2) The jewellery — every piece must remain identical in design, colour, finish, and placement.',
    '(3) The background — scenery, colours, objects, and lighting must stay exactly the same.',
    "(4) The outfit's style, cut, fabric texture, pattern/print layout, and fit — only the colour changes, not the garment design.",
    '(5) The image composition and framing — maintain the exact same crop and aspect ratio.',
    `RECOLOR RULE: Apply ${color} uniformly across the entire outfit's fabric. Preserve realistic fabric shading, highlights, and shadows so the cloth looks naturally lit.`,
    `OUTPUT: A single high-quality, photorealistic image that looks like the original photograph with only the outfit's colour changed to ${color}. Nothing else should look different. Do NOT add any text, labels, annotations, measurement indicators, arrows, or overlays of any kind to the image.`,
  ].join(' ');
}
