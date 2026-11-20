import { FAST_VIDEO_MODEL_FILES, FAST_VIDEO_MODEL_NAMES, VIDEO_MODEL_NAMES } from './model-cache';
import { PRODUCT_RESTORE_PY } from './product-restore.notebook';
import {
  CELL_COMFY,
  CELL_INSTALL,
  CELL_MODELS,
  CELL_RENDER_AND_MERGE,
  CELL_REPORTER,
  CELL_RUN,
  jobLiteral,
  modelFilesPy,
} from './reel-worker.notebook';
import { WorkerNotebookJob } from './worker-notebook-job';

const md = (source: string): Record<string, unknown> => ({ cell_type: 'markdown', metadata: {}, source });
const code = (source: string): Record<string, unknown> => ({
  cell_type: 'code',
  metadata: {},
  execution_count: null,
  outputs: [],
  source,
});

/** Read by the shared install / engine / run cells: this is the fast render. */
const CELL_FAST_FLAG = `
FAST_VIDEO = True  # Wan 2.2 TI2V-5B: one 5B model, both T4s on every step (C2C Multi-GPU Split)
`;

/**
 * Fast render: Wan 2.2 TI2V-5B (the settings it ran with in production before the detailed A14B render) instead of
 * the A14B first-last-frame graph. Runs after the shared render cell and replaces only what differs: presets, the
 * graph, 24 fps output and a one-GPU fallback when the C2C split cannot run. The real product is still locked into
 * every frame and every take still goes through the quality gate.
 */
const CELL_FAST_RENDER = `
PRESETS = {
    # TI2V-5B is trained at 1280x704 (portrait 704x1280); 121 frames at its native 24 fps (5 s).
    "reel_hq":   {"width": 704, "height": 1280, "frames": 121, "steps": 30},
    "reel_fast": {"width": 480, "height": 832, "frames": 121, "steps": 20},
}
SIZE_LADDER = [(704, 1280), (608, 1088), (544, 960), (480, 832)]  # multiples of 32 (its VAE + patch size)
FAST_NAMES = __FAST_VIDEO_MODEL_NAMES__
FAST_FPS, FAST_CFG, FAST_SHIFT = 24, 4.5, 6.0
OUT_FPS = 24  # its own frame rate, kept: no interpolated or repeated frames
DEFAULT_CLIP_SECONDS = {"reel_hq": 1800, "reel_fast": 900}
# C2C Multi-GPU Split: a full model copy per T4; CFG's two halves (and the tokens) of every step run side by side.
USE_C2C = GPU_COUNT >= 2 and not WORKER.get("c2c_off")


def make_workflow(prompt, seed, p, start_name, end_name, prefix, part="all", handoff=None, negative=None):
    """Wan 2.2 TI2V-5B image-to-video from the scene still (start frame only): UNETLoader -> ModelSamplingSD3 ->
    C2C Multi-GPU Split (both T4s, when available) -> KSampler (uni_pc, CFG 4.5) -> tiled VAE decode -> frames."""
    g = {
        "unet": comfy_node("UNETLoader", unet_name=FAST_NAMES["unet"], weight_dtype="default"),
        "clip": comfy_node("CLIPLoader", clip_name=FAST_NAMES["clip"], type="wan"),
        "vae": comfy_node("VAELoader", vae_name=FAST_NAMES["vae"]),
        "start": comfy_node("LoadImage", image=start_name),
    }
    g["pos"] = comfy_node("CLIPTextEncode", clip=["clip", 0], text=prompt)
    g["neg"] = comfy_node("CLIPTextEncode", clip=["clip", 0], text=negative or "")
    g["shift"] = comfy_node("ModelSamplingSD3", model=["unet", 0], shift=FAST_SHIFT)
    g["latent"] = comfy_node("Wan22ImageToVideoLatent", vae=["vae", 0], width=p["width"], height=p["height"],
                             length=p["frames"], batch_size=1, start_image=["start", 0])
    model = ["shift", 0]
    if USE_C2C and GPU_COUNT >= 2 and "C2CSequenceParallel" in NODES:
        g["c2c"] = comfy_node("C2CSequenceParallel", model=model, gpus=0, strategy="ring", min_tokens_per_gpu=1024,
                              fast_link_gpus=0, rank_backend="threads")
        model = ["c2c", 0]
    g["sample"] = comfy_node("KSampler", model=model, seed=seed, steps=int(p["steps"]), cfg=FAST_CFG,
                             sampler_name="uni_pc", scheduler="simple", positive=["pos", 0], negative=["neg", 0],
                             latent_image=["latent", 0], denoise=1.0)
    if "VAEDecodeTiled" in NODES:
        tiles = {"tile_size": 256, "overlap": 64, "temporal_size": 32, "temporal_overlap": 8}
        known = {**OBJECT_INFO["VAEDecodeTiled"]["input"].get("required", {})}
        g["decode"] = comfy_node("VAEDecodeTiled", samples=["sample", 0], vae=["vae", 0],
                                 **{k: v for k, v in tiles.items() if k in known})
    else:
        g["decode"] = comfy_node("VAEDecode", samples=["sample", 0], vae=["vae", 0])
    g["save"] = comfy_node("SaveImage", images=["decode", 0], filename_prefix=prefix)
    return g, FAST_FPS


_render_on_gpu0 = stage_gpu0


def stage_gpu0(work, progress):
    """The shared GPU stage; when the C2C split itself fails (it refuses this hardware, a node error), this session
    goes on with one GPU instead of failing the clip."""
    global USE_C2C
    try:
        return _render_on_gpu0(work, progress)
    except Exception as exc:
        if not (USE_C2C and "C2CSequenceParallel" in NODES) or is_oom(exc) or not engine_alive(ENGINES.get("a")):
            raise
        traceback.print_exc()
        print("C2C Multi-GPU Split failed; rendering on one GPU from now on:", exc, flush=True)
        USE_C2C = False
        WORKER["c2c_off"] = True
        progress(work, 0, f"Rendering {work.label} on one GPU", True)
        return _render_on_gpu0(work, progress)
`;

/**
 * The fast video notebook: the same job, worker session, product lock, quality gate, encode and upload as the
 * detailed one (reel-worker.notebook.ts), rendered with Wan 2.2 TI2V-5B on both T4s at once.
 */
export function buildFastReelNotebook(job: WorkerNotebookJob): Record<string, unknown> {
  // Function replacements: a `$` in the job (titles, presigned URLs) must not be read as a replacement pattern.
  const reporter = CELL_REPORTER.replace('__JOB_JSON__', () => jobLiteral(job));
  const render = CELL_RENDER_AND_MERGE.replace('__VIDEO_MODEL_NAMES__', () => JSON.stringify(VIDEO_MODEL_NAMES));
  const fast = CELL_FAST_RENDER.replace('__FAST_VIDEO_MODEL_NAMES__', () => JSON.stringify(FAST_VIDEO_MODEL_NAMES));
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python' },
      kaggle: { accelerator: 'nvidiaTeslaT4', isInternetEnabled: true, isGpuEnabled: true },
    },
    cells: [
      md(
        `# ByajBazaar marketing fast video render\n\n` +
          `Auto-generated for job \`${job.jobId}\` — do not edit. Wan 2.2 TI2V-5B on both T4s (C2C Multi-GPU ` +
          `Split); the real product is locked into every frame on the CPU. Reports live progress to the ByajBazaar ` +
          `WebSocket.`,
      ),
      code(reporter),
      code(CELL_FAST_FLAG),
      code(CELL_INSTALL),
      code(CELL_MODELS.replace('__VIDEO_MODEL_FILES__', () => modelFilesPy(FAST_VIDEO_MODEL_FILES))),
      code(CELL_COMFY),
      code(PRODUCT_RESTORE_PY),
      code(render),
      code(fast),
      code(CELL_RUN),
    ],
  };
}
