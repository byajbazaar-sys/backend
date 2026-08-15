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

    'A very subtle natural contact shadow directly beneath the product is allowed, but do not alter the existing lighting on the product.',

    'The output should look identical to the input except for the background.',

    'Background replacement only. Zero modifications to the foreground object.',
  ].join(' ');
}
