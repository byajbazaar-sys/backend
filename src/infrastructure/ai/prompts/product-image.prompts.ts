const PRODUCT_PRESERVATION_RULES = [
  'You are performing background removal only.',

  'The product is immutable and must remain pixel-faithful to the original image.',

  'Do NOT modify, recreate, redraw, regenerate, retouch, enhance, sharpen, beautify, restore, upscale, color-correct, relight, or reinterpret the product in any way.',

  'Preserve exactly:',
  '- shape',
  '- size',
  '- proportions',
  '- orientation',
  '- position',
  '- framing',
  '- perspective',
  '- metal color',
  '- gemstones and diamonds (including bright white stones)',
  '- texture',
  '- reflections',
  '- scratches',
  '- engravings',
  '- lighting',
  '- shadows on the product',
  '- edge smoothness and fine details',
  '- imperfections',

  'Do not add or remove any jewellery parts, stones, details, or accessories.',

  'Only remove the background.',

  'Do NOT add any shadows, contact shadows, drop shadows, ground shadows, or grey halos on or around the product.',

  'The output should look identical to the input except for the background.',

  'Background replacement only. Zero modifications to the foreground object.',
].join(' ');

/** Preview step: product on solid white for user review. */
export function buildProductBackgroundRemovalPrompt(): string {
  return [
    PRODUCT_PRESERVATION_RULES,

    'Replace the background with a solid pure white background (#FFFFFF).',

    'Output must be an opaque image on white — no transparency, no checkerboard, no grey, no coloured backdrop.',

    'The white background must be completely flat and uniform (#FFFFFF) with no gradients, vignettes, or shading.',

    'Remove existing background shadows; do not introduce new ones.',
  ].join(' ');
}

/** Save step: transparent PNG for Magic Try-On (AI handles edges — no post-processing matting). */
export function buildProductTransparentStoragePrompt(): string {
  return [
    PRODUCT_PRESERVATION_RULES,

    'Replace the background with a fully transparent background (alpha channel).',

    'Output must be PNG with true transparency — no solid white, grey, checkerboard, or coloured backdrop.',

    'Keep anti-aliased, smooth, clean edges around the product. Do not leave white fringes or jagged cutout artifacts.',
  ].join(' ');
}
