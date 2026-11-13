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
    '- gemstones and diamonds (including bright white stones)',
    '- texture',
    '- reflections',
    '- scratches',
    '- engravings',
    '- lighting',
    '- shadows on the product',
    '- imperfections',

    'Do not add or remove any jewellery parts, stones, details, or accessories.',

    'Only remove the background.',

    'Keep the jewellery at exactly the same position, scale and rotation in the frame. Do not crop, zoom, re-centre or re-frame the image.',

    'Everything that is not part of the jewellery is background — including hands, fingers, display stands, busts, boxes, cloth, paper, and any flat-coloured border around the photo.',

    'Replace it with a solid pure white background (#FFFFFF).',

    'Keep every opening clear to the white background: the inside of rings and hoops, the gaps between chain links, and openings in filigree.',

    'Keep the outline of the jewellery crisp, with no white or grey halo and no blurred edges.',

    'Output must be an opaque image on white — no transparency, no checkerboard, no grey, no coloured backdrop.',

    'Do NOT add any shadows, contact shadows, drop shadows, ground shadows, or grey halos on or around the product.',

    'The white background must be completely flat and uniform (#FFFFFF) with no gradients, vignettes, or shading.',

    'Remove existing background shadows; do not introduce new ones.',

    'The output should look identical to the input except for the background.',

    'Background replacement only. Zero modifications to the foreground object.',
  ].join(' ');
}
