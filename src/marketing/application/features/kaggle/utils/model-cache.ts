import { createHash } from 'crypto';

import { IMAGE_MODELS } from './image-worker.notebook';

/** A ComfyUI model file: download URL and its path inside the ComfyUI checkout. */
export interface ComfyModelFile {
  url: string;
  path: string;
}

const WAN_REPACK = 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files';
const WAN_GGUF = 'https://huggingface.co/QuantStack/Wan2.2-I2V-A14B-GGUF/resolve/main';

/**
 * Video notebook files, by role: Wan 2.2 I2V A14B (Apache-2.0) as two Q5_K_M GGUF experts (10.8 GB each; the
 * high-noise expert lays out the motion, the low-noise expert the detail), the LightX2V 4-step I2V distill LoRAs
 * (Apache-2.0) for both, umT5-XXL (fp8) and the Wan 2.1 VAE — A14B needs the 2.1 VAE, the 2.2 VAE is for 5B only.
 */
export const VIDEO_MODELS = {
  high: { url: `${WAN_GGUF}/HighNoise/Wan2.2-I2V-A14B-HighNoise-Q5_K_M.gguf`, folder: 'unet' },
  low: { url: `${WAN_GGUF}/LowNoise/Wan2.2-I2V-A14B-LowNoise-Q5_K_M.gguf`, folder: 'unet' },
  highLora: { url: `${WAN_REPACK}/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors`, folder: 'loras' },
  lowLora: { url: `${WAN_REPACK}/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors`, folder: 'loras' },
  clip: {
    url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    folder: 'text_encoders',
  },
  vae: { url: `${WAN_REPACK}/vae/wan_2.1_vae.safetensors`, folder: 'vae' },
} as const;

/** File name of each video model inside its ComfyUI folder (what the workflow nodes ask for). */
export const VIDEO_MODEL_NAMES = Object.fromEntries(
  Object.entries(VIDEO_MODELS).map(([role, m]) => [role, m.url.split('/').pop()]),
) as Record<keyof typeof VIDEO_MODELS, string>;

/** The same files as ComfyUI downloads (model cache, notebook fallback downloads). */
export const VIDEO_MODEL_FILES: ComfyModelFile[] = Object.values(VIDEO_MODELS).map((m) => ({
  url: m.url,
  path: `models/${m.folder}/${m.url.split('/').pop()}`,
}));

/**
 * Fast render (the fast video notebook): Wan 2.2 TI2V-5B (Apache-2.0, fp16, 10 GB — one model, run on both T4s at
 * once by C2C Multi-GPU Split), its Wan 2.2 VAE, and the same umT5-XXL text encoder as the detailed render.
 */
export const FAST_VIDEO_MODELS = {
  unet: { url: `${WAN_REPACK}/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors`, folder: 'diffusion_models' },
  vae: { url: `${WAN_REPACK}/vae/wan2.2_vae.safetensors`, folder: 'vae' },
  clip: VIDEO_MODELS.clip,
} as const;

export const FAST_VIDEO_MODEL_NAMES = Object.fromEntries(
  Object.entries(FAST_VIDEO_MODELS).map(([role, m]) => [role, m.url.split('/').pop()]),
) as Record<keyof typeof FAST_VIDEO_MODELS, string>;

export const FAST_VIDEO_MODEL_FILES: ComfyModelFile[] = Object.values(FAST_VIDEO_MODELS).map((m) => ({
  url: m.url,
  path: `models/${m.folder}/${m.url.split('/').pop()}`,
}));

const CHATTERBOX = 'https://huggingface.co/ResembleAI/chatterbox/resolve/main';

/**
 * ChatterBox Multilingual (Resemble AI, MIT) for the voice notebook: the files the ComfyUI_Fill-ChatterBox node loads
 * from ComfyUI/models/chatterbox/chatterbox_multilingual (it would download them itself; the cache has them ready).
 */
export const VOICE_MODEL_FILES: ComfyModelFile[] = [
  've.pt',
  't3_mtl23ls_v2.safetensors',
  's3gen.pt',
  'grapheme_mtl_merged_expanded_v1.json',
  'conds.pt',
  'Cangjie5_TC.json',
].map((name) => ({ url: `${CHATTERBOX}/${name}`, path: `models/chatterbox/chatterbox_multilingual/${name}` }));

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
 * Everything the private per-account model dataset holds (~80 GB): ComfyUI files for both notebooks plus the
 * Hugging Face repos loaded with from_pretrained (Qwen3-VL 8B planner/judge, BiRefNet_HR), plus ChatterBox for voice.
 */
export function modelCacheContents(): { comfy: ComfyModelFile[]; hf: string[] } {
  return {
    // The fast render shares the text encoder with the detailed one: each file once.
    comfy: [...IMAGE_COMFY_FILES, ...VOICE_MODEL_FILES, ...VIDEO_MODEL_FILES, ...FAST_VIDEO_MODEL_FILES].filter(
      (file, i, all) => all.findIndex((other) => other.path === file.path) === i,
    ),
    hf: [IMAGE_MODELS.analyst, IMAGE_MODELS.segmenter],
  };
}

/** Dataset slug, versioned by its contents: changing a model gives a new slug, so every account rebuilds it. */
export function modelsDatasetSlug(): string {
  const hash = createHash('sha1').update(JSON.stringify(modelCacheContents())).digest('hex').slice(0, 8);
  return `byajbazaar-models-${hash}`;
}
