/**
 * Kaggle image notebook, built per job. Quality and product accuracy come first; T4 × 2 is split by role:
 * GPU 0 paints with FLUX.2 [klein] 9B (ComfyUI; the open 4B without MARKETING_HF_TOKEN), GPU 1 keeps Qwen3-VL to plan
 * the shots and judge every take.
 *  1. Qwen3-VL (8B on T4 × 2, 4B on one GPU) reads the photo, boxes the jewellery and writes per shot a scene prompt,
 *     a full-photo prompt for AI mode, where the product sits and a camera-motion prompt.
 *  2. exact mode: BiRefNet cuts the jewellery out inside that box; klein paints only around the pinned cut-out and
 *     the original product pixels go back on top, so design, stones and metal colour stay exactly as photographed.
 *     ai mode: klein redraws the whole photo from the product reference (the judge is strict about fidelity).
 *  3. Up to 4 takes per shot; each is judged on GPU 1 while GPU 0 paints the next, and the best one is kept.
 * Logos: klein paints the backdrop and emblem; the business name is typeset (never AI-drawn), so it is spelled right.
 * RealVisXL V4 inpainting is only a fallback when klein cannot start. Progress goes to the ByajBazaar WebSocket
 * (`marketingProgress`), with an HTTPS fallback.
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
