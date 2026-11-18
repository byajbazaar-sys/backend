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

/** FLUX.2 [klein] files the image notebook uses: 9B with a Hugging Face token (gated), else the open 4B. */
export function imageComfyFiles(klein9b: boolean): ComfyModelFile[] {
  return [
    comfyFile('diffusion_models', klein9b ? IMAGE_MODELS.kleinDiffusion : IMAGE_MODELS.klein4bDiffusion),
    comfyFile('text_encoders', klein9b ? IMAGE_MODELS.kleinTextEncoder : IMAGE_MODELS.klein4bTextEncoder),
    comfyFile('vae', IMAGE_MODELS.kleinVae),
  ];
}

/**
 * Everything the private per-account model dataset holds (~55 GB with 9B): ComfyUI files for both notebooks plus
 * the Hugging Face repos loaded with from_pretrained (Qwen3-VL 8B planner/judge, BiRefNet). The RealVisXL fallback and
 * the single-GPU 4B analyst are left out — they are downloaded only when needed.
 */
export function modelCacheContents(klein9b: boolean): { comfy: ComfyModelFile[]; hf: string[] } {
  return {
    comfy: [...imageComfyFiles(klein9b), ...VIDEO_MODEL_FILES],
    hf: [IMAGE_MODELS.analystLarge, IMAGE_MODELS.segmenter],
  };
}

/** Dataset slug, versioned by its contents: changing a model (or 4B ↔ 9B) gives a new slug, so accounts rebuild it. */
export function modelsDatasetSlug(klein9b: boolean): string {
  const hash = createHash('sha1')
    .update(JSON.stringify(modelCacheContents(klein9b)))
    .digest('hex')
    .slice(0, 8);
  return `byajbazaar-models-${hash}`;
}
