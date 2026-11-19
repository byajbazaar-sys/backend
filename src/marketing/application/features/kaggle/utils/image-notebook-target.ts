/**
 * Kaggle image notebook, built per job (one job per scene / shot, so several accounts paint a campaign in parallel).
 * T4 × 2 is split by role: GPU 0 paints with FLUX.2 [klein] 9B (ComfyUI), GPU 1 keeps Qwen3-VL 8B to plan and judge.
 *  1. Qwen3-VL boxes the jewellery and, per shot, gives the placement and a product-aware scene (exact mode) or the
 *     full-photo prompt (ai mode) — one short call.
 *  2. exact mode: BiRefNet cuts the jewellery out inside that box; klein paints only around the pinned cut-out and
 *     the original product pixels go back on top, so design, stones and metal colour stay exactly as photographed.
 *     ai mode: klein redraws the whole photo from the product reference (the judge is strict about fidelity).
 *  3. Up to 4 takes per shot; each is judged on GPU 1 while GPU 0 paints the next, and the best one is kept.
 * Logos: klein paints the backdrop and emblem; the business name is typeset (never AI-drawn), so it is spelled right.
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
