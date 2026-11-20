/**
 * Kaggle image notebook, built per job (one job per scene / shot, so several accounts paint a campaign in parallel).
 * T4 × 2 is split by role: GPU 0 cuts the piece out (BiRefNet_HR) and paints with FLUX.2 [klein] 9B (ComfyUI);
 * GPU 1 keeps Qwen3-VL 8B to plan and judge; the CPU restores the real product pixels.
 *  1. While Qwen3-VL plans the shots on GPU 1, GPU 0 segments the photo at 2048 px and loads klein.
 *  2. paste path (exact mode, surfaces): klein paints only around the pinned cut-out; the untouched product goes back
 *     on top at the final resolution. redraw path (ai mode, and every on-body shot): klein draws the piece in place,
 *     then the real pixels are aligned onto it and restored wherever the two agree (fingers stay in front).
 *  3. The judge scores take 1 (plus hard limits: metal colour, extra jewellery, worn vs held); a second take is
 *     painted only when it scores under 8, told how the photo should look instead.
 * Logos: klein paints the backdrop and emblem; the business name is typeset (never AI-drawn), so it is spelled right.
 * Progress goes to the ByajBazaar WebSocket (`marketingProgress`), with an HTTPS fallback.
 */

export interface ImageNotebookTarget {
  index: number;
  kind: string;
  prompt: string;
  motionPrompt?: string;
  uploadUrl: string;
  /** Where to PUT the product mask of the delivered still (PNG); the video notebook locks those pixels per frame. */
  maskUploadUrl?: string;
  width: number;
  height: number;
}
