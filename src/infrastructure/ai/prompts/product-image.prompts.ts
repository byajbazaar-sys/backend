export function buildProductBackgroundRemovalPrompt(): string {
  return [
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
    '- gemstones',
    '- texture',
    '- reflections',
    '- scratches',
    '- engravings',
    '- lighting',
    '- shadows on the product',
    '- imperfections',

    'Do not add or remove any jewellery parts, stones, details, or accessories.',

    'Only remove the background.',

    'Replace it with a solid pure white background (#FFFFFF).',

    'Output must be an opaque image on white — no transparency, no checkerboard, no grey, no coloured backdrop.',

    'Do NOT add any shadows, contact shadows, drop shadows, ground shadows, or grey halos on or around the product.',

    'The white background must be completely flat and uniform (#FFFFFF) with no gradients, vignettes, or shading.',

    'Remove existing background shadows; do not introduce new ones.',

    'The output should look identical to the input except for the background.',

    'Background replacement only. Zero modifications to the foreground object.',
  ].join(' ');
}
