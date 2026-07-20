export function buildProductBackgroundRemovalPrompt(): string {
  return [
    'You are editing a product photo of jewellery or an inventory item.',
    'Remove the entire background. Keep the product exactly as photographed:',
    'same shape, metal color, stones, reflections, proportions, and framing.',
    'Do not redesign, enhance, crop, or add new objects.',
    'Place the product on a clean solid pure white background (#FFFFFF).',
    'Soft natural contact shadow under the product is allowed if it looks realistic.',
    'Output a single high-quality product image only.',
  ].join(' ');
}
