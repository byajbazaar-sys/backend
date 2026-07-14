import type { AiImageInput } from '../interfaces/ai-media.types';

const FACE_HEIGHT_INCHES = 8.5;
const TORSO_HEIGHT_INCHES = 18;

function earringPercent(heightInInches?: number): number | null {
  if (!heightInInches || heightInInches <= 0) return null;
  return Math.round((heightInInches / FACE_HEIGHT_INCHES) * 1000) / 10;
}

function necklacePercent(heightInInches?: number): number | null {
  if (!heightInInches || heightInInches <= 0) return null;
  return Math.round((heightInInches / TORSO_HEIGHT_INCHES) * 1000) / 10;
}

function sizeLockSection(items: AiImageInput[]): string {
  const lines: string[] = [];
  for (const item of items) {
    if (item.type === 'earring') {
      const pct = earringPercent(item.heightInInches);
      if (pct != null) {
        lines.push(
          `The earring height MUST equal exactly ${pct}% of person's face height measured chin-to-crown.`,
        );
      }
    }
    if (item.type === 'necklace') {
      const pct = necklacePercent(item.heightInInches);
      if (pct != null) {
        lines.push(
          `The necklace height MUST equal exactly ${pct}% of person's torso height measured chin-to-navel.`,
        );
      }
    }
  }
  if (!lines.length) {
    return `Jewellery must look realistic. Never oversized. Never miniature. Maintain anatomically correct proportions.`;
  }
  return lines.join('\n');
}

function occasionStyling(occasion?: string): string {
  const map: Record<string, string> = {
    Wedding: 'bridal elegance with rich jewel tones',
    Festive: 'festive ethnic styling with bold colours',
    Party: 'luxury evening glamour',
    Daily: 'casual elegant style',
    Casual: 'relaxed everyday fashion',
    Formal: 'refined formal attire',
    Birthday: 'celebratory stylish outfit',
  };
  if (!occasion) return 'elegant attire matching the jewellery';
  return map[occasion] || `${occasion} styling`;
}

export function buildJewelleryTryOnPrompt(items: AiImageInput[]): string {
  const types = items.map((i) => i.type).join(', ');
  return `
You are given multiple images.

Image 1 is a photograph of a real person.
The remaining images are reference images of jewellery (${types || 'jewellery'}).

Your task is to generate a photorealistic image of the SAME PERSON naturally wearing ONLY the provided jewellery.

══════════════════════════════════
IDENTITY PRESERVATION
══════════════════════════════════
The person MUST remain identical to Image 1.
Do NOT modify: Face shape, Eyes, Nose, Lips, Jawline, Skin tone, Hair color, Hairstyle, Expression, Age, Gender, Body shape.
Never beautify or stylize the face. Instantly recognizable as the original person.

══════════════════════════════════
JEWELLERY DESIGN FIDELITY
══════════════════════════════════
Copy every jewellery item EXACTLY from its reference.
Preserve: Shape, Size, Metal color, Finish, Texture, Carving, Stone placement, Gemstone color, Diamond arrangement, Chain, Pendant, Hooks, Clasps, Links.
Never: Simplify, Stylize, Redesign, Hallucinate, Add/remove stones, Change polish or proportions.

══════════════════════════════════
JEWELLERY COUNT
══════════════════════════════════
Only place the jewellery items that are provided.
Never generate extra jewellery (rings, bangles, maang tikka, nose ring, garland, bracelet, anklet, watch) unless provided.
If only one earring image is provided, mirror it perfectly and place one on each ear.

══════════════════════════════════
SIZE ACCURACY
══════════════════════════════════
${sizeLockSection(items)}

══════════════════════════════════
PLACEMENT
══════════════════════════════════
Necklace: centered on neck, natural curve, rests on chest, chain touches skin, pendant hangs vertically.
Earrings: one on each ear, hanging naturally, symmetrical, correct gravity.
Jewellery must appear physically attached — never floating or pasted.

══════════════════════════════════
IMAGE PRESERVATION
══════════════════════════════════
Keep identical: Pose, Background, Camera angle, Crop, Lighting, Clothing, Hands, Body posture, Hair.
ONLY jewellery should change.

══════════════════════════════════
OUTPUT QUALITY
══════════════════════════════════
Ultra photorealistic. Luxury jewellery catalog. DSLR. Natural skin texture. HDR. Sharp jewellery. 1024×1024 square.
No text, watermark, logo, labels, arrows, or AI artifacts.
`.trim();
}

export function buildOutfitTryOnPrompt(opts: {
  items: AiImageInput[];
  outfit?: string;
  occasion?: string;
  color?: string;
}): string {
  const jewelleryPrompt = buildJewelleryTryOnPrompt(opts.items);
  const outfitLabel = opts.outfit || 'an elegant outfit';
  const colorLine = opts.color
    ? `Use this exact outfit fabric color: ${opts.color}.`
    : 'Choose an outfit color that naturally matches the jewellery.';

  return `
${jewelleryPrompt}

══════════════════════════════════
OUTFIT MODE
══════════════════════════════════
Also replace ONLY the clothing.
Keep Face, Hair, Body, Jewellery, Background, Pose, Lighting unchanged.
Dress the person in: ${outfitLabel}.
Occasion styling: ${occasionStyling(opts.occasion)}.
${colorLine}
Never keep the original clothing.
`.trim();
}

export function buildOutfitRecolorPrompt(color: string): string {
  return `
Recolor ONLY the fabric of the outfit to ${color}.

Do NOT modify: Face, Hair, Skin, Jewellery, Background, Pose, Camera angle, Outfit design, Fabric texture, Pattern, Fit.

Only change the fabric color.
Maintain realistic lighting, shadows, folds, reflections, wrinkles, and cloth texture.
The output should look like the original photograph with only the outfit color changed.
Square 1024×1024. No text, watermark, or labels.
`.trim();
}
