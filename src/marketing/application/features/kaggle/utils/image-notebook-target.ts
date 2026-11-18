/**
 * Kaggle image notebook, built per job. Product accuracy comes first:
 *  1. BiRefNet cuts the jewellery out of the source photo (fine chains and stones included).
 *  2. Qwen3-VL (8B on T4 × 2, 4B on one GPU) reads the photo and the requested shots and writes, per shot, a short
 *     scene prompt (what surrounds the product), where the product sits in the frame and a camera-motion prompt.
 *  3. RealVisXL V4 inpainting (photoreal SDXL) paints only the scene around the cutout; the original product pixels
 *     are composited back on top, so the design, stones and metal colour stay exactly as photographed.
 *  4. With a second GPU, Qwen3-VL judges each candidate (duplicates, placement, anatomy) and the best one is kept.
 * Logos: SDXL paints the backdrop and emblem; the business name is typeset (never AI-drawn), so it is spelled right.
 * Progress goes to the ByajBazaar WebSocket (`marketingProgress`), with an HTTPS fallback.
 */

export interface ImageNotebookTarget {
  index: number;
  kind: string;
  prompt: string;
  motionPrompt?: string;
  uploadUrl: string;
  width: number;
  height: number;
}
