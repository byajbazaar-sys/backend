import { createHash } from 'crypto';

import { IMAGE_MODELS } from './image-worker.notebook';

/** A ComfyUI model file: download URL and its path inside the ComfyUI checkout. */
export interface ComfyModelFile {
  url: string;
  path: string;
}

/** Wan 2.2 TI2V-5B files used by the video notebook. */
export const VIDEO_MODEL_FILES: ComfyModelFile[] = [
  {
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors',
    path: 'models/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors',
  },
  {
    url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    path: 'models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  },
  {
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors',
    path: 'models/vae/wan2.2_vae.safetensors',
  },
];

const comfyFile = (folder: string, url: string): ComfyModelFile => ({
  url,
  path: `models/${folder}/${url.split('/').pop()}`,
});

/** FLUX.2 [klein] 9B files the image notebook uses (the diffusion model is gated: MARKETING_HF_TOKEN). */
export const IMAGE_COMFY_FILES: ComfyModelFile[] = [
  comfyFile('diffusion_models', IMAGE_MODELS.kleinDiffusion),
  comfyFile('text_encoders', IMAGE_MODELS.kleinTextEncoder),
  comfyFile('vae', IMAGE_MODELS.kleinVae),
];

/**
 * Everything the private per-account model dataset holds (~55 GB): ComfyUI files for both notebooks plus the
 * Hugging Face repos loaded with from_pretrained (Qwen3-VL 8B planner/judge, BiRefNet).
 */
export function modelCacheContents(): { comfy: ComfyModelFile[]; hf: string[] } {
  return {
    comfy: [...IMAGE_COMFY_FILES, ...VIDEO_MODEL_FILES],
    hf: [IMAGE_MODELS.analyst, IMAGE_MODELS.segmenter],
  };
}

/** Dataset slug, versioned by its contents: changing a model gives a new slug, so every account rebuilds it. */
export function modelsDatasetSlug(): string {
  const hash = createHash('sha1').update(JSON.stringify(modelCacheContents())).digest('hex').slice(0, 8);
  return `byajbazaar-models-${hash}`;
}
