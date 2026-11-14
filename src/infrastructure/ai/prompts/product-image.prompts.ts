/**
 * Background-removal prompt for inventory photos.
 *
 * Shop-floor photos usually show the piece inside a plastic pouch, on a velvet display card or stand, held in a
 * hand, with tags and the counter around it — so the prompt spells out that all of that is background.
 *
 * The wording is deliberately short and was validated on real photos: longer, more emphatic variants ("crisp
 * outline", "no halo", "no checkerboard", long preserve-lists) make FLUX hand back line-art sketches instead of
 * the photo. Change it only together with a check on real shop photos. Faithfulness is enforced afterwards by
 * keeping the original photo's pixels wherever the model agrees with it.
 */
export function buildProductBackgroundRemovalPrompt(options: { retry?: boolean } = {}): string {
  return [
    'Product photo cleanup for a jewellery catalogue.',

    'The photo shows a single piece of jewellery (chain, necklace, ring, bangle, earrings) that may be sealed inside a transparent plastic pouch, lying on a black velvet display card or stand, held in a hand, with price tags, stickers, rubber bands, labels and a shop counter around it.',

    'Keep ONLY the jewellery itself. Everything else is background and must be removed: the plastic pouch and its reflections, the display card, stand or bust, hands and fingers, tags, stickers, labels, rubber bands, the counter and all surroundings.',

    ...(options.retry
      ? [
          'The previous attempt kept the packaging around the jewellery. Remove it completely this time: only the jewellery may remain.',
        ]
      : []),

    'Output the jewellery alone, exactly as photographed — same shape, size, position, orientation, metal colour, stones and details — on a flat, pure white (#FFFFFF) background with no shadows, no halo and no transparency.',

    'Do not redraw, stylise, sketch, enhance or reinterpret the jewellery. Keep its openings and gaps clear to the white background.',
  ].join(' ');
}
