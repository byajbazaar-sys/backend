import { ImageNotebookJob } from './image-notebook-job';

/** Hugging Face models the image notebook downloads (all public, no token needed). Also checked by account setup. */
export const IMAGE_MODELS = {
  generator: 'OzzyGT/RealVisXL_V4.0_inpainting',
  vae: 'madebyollin/sdxl-vae-fp16-fix',
  segmenter: 'ZhengPeng7/BiRefNet',
  analystLarge: 'Qwen/Qwen3-VL-8B-Instruct',
  analystSmall: 'Qwen/Qwen3-VL-4B-Instruct',
  /**
   * FLUX.2 [klein] 9B distilled (fp8 weights, fp16 compute on T4) for ComfyUI — paints every shot in both modes.
   * Gated on Hugging Face and under the FLUX Non-Commercial License: needs MARKETING_HF_TOKEN from an account that
   * accepted it (and a BFL commercial licence for business use).
   */
  kleinDiffusion:
    'https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-fp8/resolve/main/flux-2-klein-9b-fp8.safetensors',
  kleinTextEncoder:
    'https://huggingface.co/Comfy-Org/flux2-klein-9B/resolve/main/split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors',
  kleinVae: 'https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors',
  /** FLUX.2 [klein] 4B (Apache-2.0, open) — used when no Hugging Face token is configured. */
  klein4bDiffusion: 'https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/resolve/main/flux-2-klein-4b.safetensors',
  klein4bTextEncoder:
    'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors',
} as const;

const md = (source: string) => ({ cell_type: 'markdown', metadata: {}, source });
const code = (source: string) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source });

const CELL_SETUP = `
import os, sys, json, time, subprocess, traceback, threading, io, re, gc, random, math, uuid
os.environ.setdefault("HF_HOME", "/tmp/hf")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "websocket-client", "requests"], check=False)
import requests, websocket

JOB = json.loads(__JOB_JSON__)
MODELS = json.loads(__MODELS_JSON__)
# Inside a warm worker session WORKER survives between jobs: loaded analyst, running ComfyUI, installed packages,
# and LOCAL_MODELS (Hugging Face repos symlinked from the private model dataset). Standalone runs start empty.
WORKER = globals().setdefault("WORKER", {})
MODELS.update({key: WORKER["local_models"][repo] for key, repo in MODELS.items()
               if repo in WORKER.get("local_models", {})})
# exact = cut out the real product, paint only the scene around it; ai = FLUX.2 [klein] redraws the whole shot
MODE = "ai" if JOB.get("mode") == "ai" and JOB["type"] != "logo" else "exact"


class Reporter:
    """Pushes progress to the ByajBazaar AWS WebSocket; falls back to HTTPS when the socket is down."""

    def __init__(self):
        self.ws, self.lock = None, threading.Lock()
        self.last_sent, self.last_stage = 0.0, None

    def send(self, stage, progress, message="", status=None, force=False, **extra):
        now = time.time()
        if not force and stage == self.last_stage and now - self.last_sent < 4:
            return
        self.last_sent, self.last_stage = now, stage
        payload = {"action": "marketingProgress", "jobId": JOB["jobId"], "token": JOB["token"],
                   "stage": stage, "progress": int(max(0, min(100, progress))), "message": str(message)[:240]}
        if status:
            payload["status"] = status
        payload.update(extra)
        print(f"[{time.strftime('%H:%M:%S')}] {stage} {payload['progress']}% {message}", flush=True)
        with self.lock:
            for _ in range(2):
                try:
                    if self.ws is None:
                        url = f"{JOB['wsUrl']}?workerJob={JOB['jobId']}&workerToken={JOB['token']}"
                        self.ws = websocket.create_connection(url, timeout=20)
                    self.ws.send(json.dumps(payload))
                    return
                except Exception as exc:  # API Gateway drops idle sockets: reconnect once
                    print("websocket error:", exc, flush=True)
                    try:
                        self.ws and self.ws.close()
                    except Exception:
                        pass
                    self.ws = None
        if JOB.get("apiBaseUrl"):
            try:
                requests.post(f"{JOB['apiBaseUrl'].rstrip('/')}/api/v1/public/marketing/worker-events",
                              json=payload, timeout=20).raise_for_status()
            except Exception as exc:
                print("http fallback failed:", exc, flush=True)


report = Reporter()
report.send("imageSetup", 1, "Image worker started", force=True)

try:
    if not WORKER.get("image_packages"):
        subprocess.run([sys.executable, "-m", "pip", "install", "-q",
                        "transformers>=4.57,<5", "diffusers>=0.34", "accelerate>=1.2", "bitsandbytes>=0.45",
                        "safetensors", "pillow", "timm", "kornia", "einops"], check=True)
        WORKER["image_packages"] = True
    import numpy as np
    import torch
    from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

    if not torch.cuda.is_available():
        raise RuntimeError("A Kaggle GPU is required (set the accelerator to GPU T4 x2).")
    GPU_COUNT = torch.cuda.device_count()
    GEN_DEVICE = "cuda:0"
    VLM_DEVICE = "cuda:1" if GPU_COUNT >= 2 else "cuda:0"
    # With a second GPU the analyst stays loaded and judges every candidate; on one GPU it is unloaded after planning.
    JUDGE = GPU_COUNT >= 2 and JOB["type"] != "logo"
    OUT_DIR = "/kaggle/working/marketing-images"
    os.makedirs(OUT_DIR, exist_ok=True)

    source = None
    source_path = None
    if JOB.get("sourceImageUrl"):
        report.send("imageSetup", 3, "Downloading the product photo", force=True)
        response = requests.get(JOB["sourceImageUrl"], timeout=180)
        response.raise_for_status()
        opened = ImageOps.exif_transpose(Image.open(io.BytesIO(response.content)))
        if "A" in opened.getbands():
            flat = Image.new("RGB", opened.size, "white")
            flat.paste(opened.convert("RGBA"), mask=opened.convert("RGBA").getchannel("A"))
            source = flat
        else:
            source = opened.convert("RGB")
        if max(source.size) > 2048:
            source.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        source_path = os.path.join(OUT_DIR, "source.jpg")
        small = source.copy()
        small.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        small.save(source_path, quality=95)
    elif JOB["type"] != "logo":
        raise RuntimeError("The job has no product photo")
    report.send("imageSetup", 5, f"Image engine installed ({GPU_COUNT} GPU)", force=True)
except Exception as exc:
    traceback.print_exc()
    report.send("failed", 0, f"Image worker setup failed: {type(exc).__name__}: {exc}", status="failed", force=True)
    raise
`;

const CELL_ANALYST = `
VLM = None
VLM_PROCESSOR = None
VLM_ID = MODELS["analystLarge"] if GPU_COUNT >= 2 else MODELS["analystSmall"]


def free_gpu():
    gc.collect()
    torch.cuda.empty_cache()


def load_vlm():
    global VLM, VLM_PROCESSOR
    cached = WORKER.get("vlm")
    if cached and cached[0] == VLM_ID:  # warm session: already on its GPU
        _, VLM, VLM_PROCESSOR = cached
        return
    from transformers import AutoProcessor, BitsAndBytesConfig, Qwen3VLForConditionalGeneration
    quantization = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True,
                                      bnb_4bit_compute_dtype=torch.float16)
    VLM = Qwen3VLForConditionalGeneration.from_pretrained(
        VLM_ID, torch_dtype=torch.float16, quantization_config=quantization,
        device_map={"": VLM_DEVICE}, low_cpu_mem_usage=True)
    VLM.eval()
    VLM_PROCESSOR = AutoProcessor.from_pretrained(VLM_ID)
    WORKER["vlm"] = (VLM_ID, VLM, VLM_PROCESSOR)


def unload_vlm():
    global VLM, VLM_PROCESSOR
    VLM, VLM_PROCESSOR = None, None
    WORKER.pop("vlm", None)
    free_gpu()


def ask_vlm(image_paths, text, max_new_tokens=900):
    content = [{"type": "image", "image": path} for path in image_paths] + [{"type": "text", "text": text}]
    inputs = VLM_PROCESSOR.apply_chat_template(
        [{"role": "user", "content": content}], tokenize=True, add_generation_prompt=True,
        return_dict=True, return_tensors="pt").to(VLM_DEVICE)
    with torch.inference_mode():
        generated = VLM.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
    generated = generated[:, inputs["input_ids"].shape[1]:]
    return VLM_PROCESSOR.batch_decode(generated, skip_special_tokens=True)[0].strip()


def parse_json(answer):
    start, end = answer.find("{"), answer.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the answer: " + answer[:200])
    return json.loads(answer[start:end + 1])


def words(text, limit):
    parts = str(text or "").replace('"', "").split()
    return " ".join(parts[:limit])


def clamp(value, low, high, default):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(number):
        return default
    return max(low, min(high, number))


# Where the product sits (centre x, centre y, width as a fraction of the frame) when the analyst gives nothing usable.
DEFAULT_PLACEMENT = {
    "closeup": (0.5, 0.52, 0.62),
    "present": (0.5, 0.6, 0.36),
    "hands": (0.5, 0.56, 0.42),
    "worn": (0.5, 0.45, 0.38),
    "scene": (0.5, 0.52, 0.56),
}


def placement_for(kind, raw):
    x, y, s = DEFAULT_PLACEMENT.get(kind, DEFAULT_PLACEMENT["scene"])
    raw = raw if isinstance(raw, dict) else {}
    return {"x": clamp(raw.get("x"), 0.2, 0.8, x), "y": clamp(raw.get("y"), 0.2, 0.85, y),
            "scale": clamp(raw.get("scale"), 0.18, 0.8, s)}


def fallback_plan(target):
    return {"scene_prompt": words(target["prompt"], 55),
            "ai_prompt": words(target["prompt"], 110) + ". Keep the exact jewellery from image 1 identical: same "
                         "design, stones, metal colour and proportions. Photorealistic advertising photograph.",
            "motion_prompt": target.get("motionPrompt") or "Slow gentle push-in, soft light glints, the jewellery stays sharp and unchanged.",
            "placement": placement_for(target["kind"], None)}


PLAN_INSTRUCTIONS = (
    "You are the art director of a jewellery advertising shoot. The image is the real product photo. "
    "First list only visible facts about the jewellery: type, metal colour, stones and their colours, motifs, shape. "
    "The real product cut-out will be composited into every shot unchanged, so for each requested shot write: "
    "scene_prompt = at most 55 words describing ONLY what surrounds the product (background, surface, or the person "
    "and body part wearing or holding it, outfit, lighting, camera framing), most important subject first; refer to "
    "the product only as 'the jewellery' and never describe its design or add other jewellery. "
    "placement = where the product's centre sits in the frame (x and y from 0 to 1) and its width as a fraction of "
    "the frame width (scale 0.2 to 0.8) so it sits naturally: a necklace at the base of the neck, earrings at the "
    "ears, a ring or bangle on the hand, a product resting on a surface in the lower middle. "
    "motion_prompt = one gentle 5-second camera move that keeps the jewellery sharp and unchanged. "
    "ai_prompt = 60 to 110 words for an image-editing model that receives this product photo as image 1: describe "
    "the finished photo (setting, person or surface, pose, outfit, lighting, camera), and call the product 'the exact "
    "jewellery from image 1' that must stay identical: same design, motifs, stones, stone count, metal colour and "
    "proportions, at a realistic size; no other jewellery. "
    "product_box = a tight box around ONLY the jewellery in the photo (no hands, fingers, boxes or props), as "
    "[x1, y1, x2, y2] in 0-1000 coordinates of the image width and height. "
    "Answer with JSON only, exactly this shape: "
    '{"product_facts": "...", "product_box": [x1, y1, x2, y2], "shots": [{"index": 0, "scene_prompt": "...", '
    '"ai_prompt": "...", "placement": {"x": 0.5, "y": 0.5, "scale": 0.5}, "motion_prompt": "..."}]}. '
    "Include every requested index exactly once."
)

PRODUCT_BOX = None  # (x1, y1, x2, y2) pixels in the source photo, from the analyst


def parse_box(raw):
    """0-1000 analyst box → source pixels; None when unusable (too small, too big, inverted)."""
    try:
        x1, y1, x2, y2 = [float(v) for v in raw][:4]
    except Exception:
        return None
    x1, x2 = sorted((max(0.0, min(1000.0, x1)), max(0.0, min(1000.0, x2))))
    y1, y2 = sorted((max(0.0, min(1000.0, y1)), max(0.0, min(1000.0, y2))))
    area = (x2 - x1) * (y2 - y1) / 1e6
    if not 0.004 < area < 0.97:
        return None
    w, h = source.size
    return (int(x1 / 1000 * w), int(y1 / 1000 * h), int(x2 / 1000 * w), int(y2 / 1000 * h))


def padded_box(box, pad=0.06):
    x1, y1, x2, y2 = box
    px, py = int((x2 - x1) * pad) + 4, int((y2 - y1) * pad) + 4
    return (max(0, x1 - px), max(0, y1 - py), min(source.width, x2 + px), min(source.height, y2 + py))


def plan_shots():
    if JOB["type"] == "logo":
        return {int(t["index"]): {"scene_prompt": t["prompt"], "motion_prompt": t.get("motionPrompt") or "",
                                  "placement": None} for t in JOB["targets"]}
    report.send("imageAnalysis", 7, f"Loading the image analyst ({VLM_ID.split('/')[-1]})", force=True)
    load_vlm()
    brief = [{"index": t["index"], "kind": t["kind"], "direction": words(t["prompt"], 120),
              "frame": f"{t['width']}x{t['height']}"} for t in JOB["targets"]]
    request = (PLAN_INSTRUCTIONS + " Campaign: " + str(JOB["title"]) + ". Style: " +
               str(JOB.get("style") or "premium jewellery advertising") + ". Requested shots: " +
               json.dumps(brief, ensure_ascii=False))
    plans = {int(t["index"]): fallback_plan(t) for t in JOB["targets"]}
    report.send("imageAnalysis", 10, "Studying the product photo", force=True)
    global PRODUCT_BOX
    for attempt in range(2):
        try:
            result = parse_json(ask_vlm([source_path], request, max_new_tokens=2200))
            print("Product facts:", result.get("product_facts", ""), flush=True)
            PRODUCT_BOX = parse_box(result.get("product_box")) or PRODUCT_BOX
            print("Product box:", PRODUCT_BOX, flush=True)
            by_kind = {int(t["index"]): t for t in JOB["targets"]}
            got = 0
            for shot in result.get("shots", []):
                idx = int(shot.get("index", -1))
                if idx not in by_kind:
                    continue
                scene = words(shot.get("scene_prompt"), 60)
                if len(scene) >= 20:
                    plans[idx]["scene_prompt"] = scene
                    got += 1
                ai_prompt = words(shot.get("ai_prompt"), 130)
                if len(ai_prompt) >= 40:
                    plans[idx]["ai_prompt"] = ai_prompt
                motion = str(shot.get("motion_prompt") or "").strip()
                if len(motion) >= 8:
                    plans[idx]["motion_prompt"] = motion[:600]
                plans[idx]["placement"] = placement_for(by_kind[idx]["kind"], shot.get("placement"))
            if got == len(plans):
                break
            print(f"Analyst planned {got}/{len(plans)} shots, retrying", flush=True)
        except Exception:
            traceback.print_exc()
        request += " Return strictly valid JSON, no commentary."
    if not JUDGE:
        unload_vlm()
    return plans


try:
    PLANS = plan_shots()
    report.send("imageAnalysis", 14, "Shots planned", force=True)
except Exception as exc:
    traceback.print_exc()
    report.send("failed", 10, f"Image analysis failed: {type(exc).__name__}: {exc}", status="failed", force=True)
    raise
`;

const CELL_CUTOUT = `
PRODUCT = None  # RGBA cut-out of the jewellery (or the whole photo, feathered, when it cannot be separated)
PRODUCT_MODE = None


def segment(image):
    from torchvision import transforms
    from transformers import AutoModelForImageSegmentation
    torch.set_float32_matmul_precision("high")
    model = AutoModelForImageSegmentation.from_pretrained(MODELS["segmenter"], trust_remote_code=True)
    model.to(GEN_DEVICE).eval().half()
    prepare = transforms.Compose([transforms.Resize((1024, 1024)), transforms.ToTensor(),
                                  transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    batch = prepare(image).unsqueeze(0).to(GEN_DEVICE).half()
    with torch.inference_mode():
        pred = model(batch)[-1].sigmoid().float().cpu()[0].squeeze()
    mask = transforms.functional.to_pil_image(pred).resize(image.size, Image.Resampling.BILINEAR)
    del model, batch
    free_gpu()
    return mask


def feathered_frame(image):
    w, h = image.size
    edge = max(4, int(min(w, h) * 0.04))
    alpha = Image.new("L", (w, h), 0)
    ImageDraw.Draw(alpha).rectangle([edge, edge, w - edge, h - edge], fill=255)
    rgba = image.convert("RGBA")
    rgba.putalpha(alpha.filter(ImageFilter.GaussianBlur(edge / 2)))
    return rgba


REFERENCE_PATH = None  # AI mode: the product photo the image model works from


def product_mask():
    """Full-size mask of the jewellery: segmented inside the analyst's box when there is one."""
    if not PRODUCT_BOX:
        return segment(source)
    box = padded_box(PRODUCT_BOX)
    crop_mask = segment(source.crop(box))
    full = Image.new("L", source.size, 0)
    full.paste(crop_mask, box[:2])
    return full


try:
    if JOB["type"] != "logo" and MODE == "ai":
        reference = source.crop(padded_box(PRODUCT_BOX, 0.12)) if PRODUCT_BOX else source
        REFERENCE_PATH = os.path.join(OUT_DIR, "reference.png")
        reference.save(REFERENCE_PATH)
        report.send("imageCutout", 19, "Product located", force=True)
    elif JOB["type"] != "logo":
        report.send("imageCutout", 16, "Cutting out the jewellery", force=True)
        try:
            mask = product_mask()
            values = np.asarray(mask, dtype=np.float32) / 255.0
            solid = values > 0.5
            coverage = float(solid.mean())
            print(f"Product mask covers {coverage * 100:.1f}% of the photo", flush=True)
            if not 0.0008 < coverage < 0.9:
                raise ValueError(f"mask coverage {coverage:.3f} out of range")
            ys, xs = np.where(solid)
            pad = int(max(source.size) * 0.015)
            box = (int(max(0, xs.min() - pad)), int(max(0, ys.min() - pad)),
                   int(min(source.width, xs.max() + pad + 1)), int(min(source.height, ys.max() + pad + 1)))
            PRODUCT = source.crop(box).convert("RGBA")
            PRODUCT.putalpha(mask.crop(box))
            PRODUCT_MODE = "cutout"
        except Exception as exc:
            print("Cut-out not usable, keeping the product photo:", exc, flush=True)
            PRODUCT = feathered_frame(source.crop(padded_box(PRODUCT_BOX)) if PRODUCT_BOX else source)
            PRODUCT_MODE = "frame"
        report.send("imageCutout", 19, "Jewellery cut out" if PRODUCT_MODE == "cutout" else "Using the full photo",
                    force=True)
except Exception as exc:
    traceback.print_exc()
    report.send("failed", 15, f"Product cut-out failed: {type(exc).__name__}: {exc}", status="failed", force=True)
    raise
`;

const CELL_ENGINE = `
# FLUX.2 [klein] 9B (fp8 weights, fp16 compute; 4B without a Hugging Face token) in ComfyUI on GPU 0 paints every
# shot (Qwen-Image only runs in bf16/fp32 there).
# exact mode: it paints only around the pinned product (latent noise mask), then the real pixels go back on top.
# ai mode: it redraws the whole photo from the product reference. GPU 1 keeps Qwen3-VL to judge every take.
# The ~18 GB of weights download in the background while the analyst plans the shots.
COMFY_DIR = "/tmp/ComfyUI"
COMFY = "http://127.0.0.1:8188"
KLEIN_STEPS = 4  # the distilled klein model is trained for 4 steps
COMFY_STATE = WORKER.setdefault("comfy_image", {"proc": None, "info": None, "fp32_text": False, "error": None})
COMFY_STATE["error"] = None
if COMFY_STATE["proc"] is not None and COMFY_STATE["proc"].poll() is not None:
    COMFY_STATE.update(proc=None, info=None)  # it died since the last job: start a fresh one
HF_TOKEN = JOB.get("hfToken") or ""
KLEIN_9B = bool(HF_TOKEN)  # 9B is gated: without a token the open 4B model paints instead
KLEIN_NAME = "FLUX.2 [klein] 9B" if KLEIN_9B else "FLUX.2 [klein] 4B"
KLEIN = {
    "unet": ("models/diffusion_models", MODELS["kleinDiffusion" if KLEIN_9B else "klein4bDiffusion"]),
    "clip": ("models/text_encoders", MODELS["kleinTextEncoder" if KLEIN_9B else "klein4bTextEncoder"]),
    "vae": ("models/vae", MODELS["kleinVae"]),
}


def hf_headers(url):
    return {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN and "huggingface.co" in url else {}


def fetch(url, dst, label):
    part = dst + ".part"
    if os.path.exists(dst) and os.path.getsize(dst) > 1_000_000:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    for attempt in range(1, 6):
        done = os.path.getsize(part) if os.path.exists(part) else 0
        try:
            headers = {**hf_headers(url), **({"Range": f"bytes={done}-"} if done else {})}
            with requests.get(url, stream=True, headers=headers, timeout=(30, 300)) as r:
                if r.status_code in (401, 403):
                    raise RuntimeError(f"Hugging Face refused {label} (HTTP {r.status_code}): the token's account must "
                                       "accept the FLUX.2 [klein] licence on huggingface.co")
                if done and r.status_code != 206:
                    done = 0
                r.raise_for_status()
                with open(part, "ab" if done else "wb") as f:
                    for chunk in r.iter_content(16 * 1024 * 1024):
                        f.write(chunk)
            os.replace(part, dst)
            print(f"Downloaded {label} ({os.path.getsize(dst) / 1e9:.1f} GB)", flush=True)
            return
        except requests.RequestException as exc:
            print(f"{label} download attempt {attempt} failed: {exc}", flush=True)
            time.sleep(5 * attempt)
    raise RuntimeError(f"Could not download {label}")


def prefetch_engine():
    """Background: clone ComfyUI and download the klein weights (network only — no pip, no GPU)."""
    try:
        if not os.path.isdir(COMFY_DIR):
            subprocess.run(["git", "clone", "--depth", "1", "https://github.com/comfyanonymous/ComfyUI.git",
                            COMFY_DIR], check=True, capture_output=True)
        for (folder, url), label in zip(KLEIN.values(), [KLEIN_NAME, "its text encoder", "its VAE"]):
            fetch(url, os.path.join(COMFY_DIR, folder, url.split("/")[-1]), label)
    except Exception as exc:
        traceback.print_exc()
        COMFY_STATE["error"] = f"{type(exc).__name__}: {exc}"


PREFETCH = threading.Thread(target=prefetch_engine, daemon=True)
if COMFY_STATE["info"] is None:  # a warm session already has klein running
    PREFETCH.start()



def start_comfy():
    if COMFY_STATE["proc"] is not None:
        COMFY_STATE["proc"].terminate()
        time.sleep(3)
    env = dict(os.environ)
    env["CUDA_VISIBLE_DEVICES"] = "0"  # GPU 1 belongs to the analyst / judge
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    args = [sys.executable, f"{COMFY_DIR}/main.py", "--listen", "127.0.0.1", "--port", "8188",
            "--fp32-vae", "--disable-pinned-memory", "--preview-method", "none"]
    if COMFY_STATE["fp32_text"]:
        args.append("--fp32-text-enc")
    log = open("/tmp/comfyui-image.log", "w")
    COMFY_STATE["proc"] = subprocess.Popen(args, cwd=COMFY_DIR, env=env, stdout=log, stderr=subprocess.STDOUT)
    for _ in range(180):
        if COMFY_STATE["proc"].poll() is not None:
            raise RuntimeError("ComfyUI exited: " + open("/tmp/comfyui-image.log").read()[-1500:])
        try:
            if requests.get(f"{COMFY}/system_stats", timeout=3).ok:
                break
        except requests.RequestException:
            pass
        time.sleep(2)
    COMFY_STATE["info"] = requests.get(f"{COMFY}/object_info", timeout=60).json()


def ensure_comfy():
    if COMFY_STATE["info"] is not None:
        return
    if PREFETCH.is_alive():
        report.send("imageSetup", 20, f"Finishing the {KLEIN_NAME} download", force=True)
        PREFETCH.join()
    if COMFY_STATE["error"]:
        raise RuntimeError(COMFY_STATE["error"])
    report.send("imageSetup", 21, f"Installing the {KLEIN_NAME} image engine", force=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", f"{COMFY_DIR}/requirements.txt"], check=True)
    start_comfy()


def node(cls, **inputs):
    """A ComfyUI API node, checked against /object_info: unknown inputs fail loudly, missing widgets get defaults."""
    info = COMFY_STATE["info"].get(cls)
    if info is None:
        raise RuntimeError(f"ComfyUI has no {cls} node — the ComfyUI checkout is too old")
    spec = info.get("input", {})
    known = {**spec.get("required", {}), **spec.get("optional", {})}
    unknown = [k for k in inputs if k not in known]
    if unknown:
        raise RuntimeError(f"{cls} has no input {unknown}; it takes {list(known)}")
    for name, item in spec.get("required", {}).items():
        if name in inputs:
            continue
        kind = item[0]
        cfg = item[1] if len(item) > 1 and isinstance(item[1], dict) else {}
        options = kind if isinstance(kind, list) else cfg.get("options") if kind == "COMBO" else None
        if "default" in cfg:
            inputs[name] = cfg["default"]
        elif options:
            inputs[name] = options[0]
        else:
            raise RuntimeError(f"{cls}: required input {name} is not wired")
    return {"class_type": cls, "inputs": inputs}


def klein_workflow(prompt, seed, width, height, reference=None, canvas=None, mask=None):
    """The official ComfyUI "Flux.2 [Klein] Distilled" graph (4B and 9B share it) in API format.
    reference: uploaded image the model edits from (ReferenceLatent on both conditionings).
    canvas + mask: keep the canvas where the mask is black and paint only where it is white (SetLatentNoiseMask)."""
    name = lambda key: KLEIN[key][1].split("/")[-1]
    graph = {
        "unet": node("UNETLoader", unet_name=name("unet"), weight_dtype="default"),
        "clip": node("CLIPLoader", clip_name=name("clip"), type="flux2"),
        "vae": node("VAELoader", vae_name=name("vae")),
        "pos": node("CLIPTextEncode", clip=["clip", 0], text=prompt),
        "neg": node("ConditioningZeroOut", conditioning=["pos", 0]),
    }
    positive, negative = ["pos", 0], ["neg", 0]
    if reference:
        graph["ref"] = node("LoadImage", image=reference)
        graph["refscale"] = node("ImageScaleToTotalPixels", image=["ref", 0], upscale_method="lanczos",
                                 megapixels=1.0)
        graph["refenc"] = node("VAEEncode", pixels=["refscale", 0], vae=["vae", 0])
        graph["posref"] = node("ReferenceLatent", conditioning=positive, latent=["refenc", 0])
        graph["negref"] = node("ReferenceLatent", conditioning=negative, latent=["refenc", 0])
        positive, negative = ["posref", 0], ["negref", 0]
    if canvas and mask:
        graph["canvas"] = node("LoadImage", image=canvas)
        graph["canvasenc"] = node("VAEEncode", pixels=["canvas", 0], vae=["vae", 0])
        graph["paintmask"] = node("LoadImageMask", image=mask, channel="red")
        graph["latent"] = node("SetLatentNoiseMask", samples=["canvasenc", 0], mask=["paintmask", 0])
    else:
        graph["latent"] = node("EmptyFlux2LatentImage", width=width, height=height, batch_size=1)
    graph.update({
        "guider": node("CFGGuider", model=["unet", 0], positive=positive, negative=negative, cfg=1.0),
        "noise": node("RandomNoise", noise_seed=seed),
        "sampler": node("KSamplerSelect", sampler_name="euler"),
        "sched": node("Flux2Scheduler", steps=KLEIN_STEPS, width=width, height=height),
        "sample": node("SamplerCustomAdvanced", noise=["noise", 0], guider=["guider", 0], sampler=["sampler", 0],
                       sigmas=["sched", 0], latent_image=["latent", 0]),
        "decode": node("VAEDecode", samples=["sample", 0], vae=["vae", 0]),
        "save": node("SaveImage", images=["decode", 0], filename_prefix=f"klein/{JOB['jobId'][:8]}"),
    })
    return graph


def run_comfy(workflow, timeout=1200):
    r = requests.post(f"{COMFY}/prompt", json={"prompt": workflow, "client_id": uuid.uuid4().hex}, timeout=120)
    if not r.ok:
        raise RuntimeError("ComfyUI rejected the workflow: " + r.text[:1200])
    pid = r.json()["prompt_id"]
    started = time.time()
    while time.time() - started < timeout:
        item = requests.get(f"{COMFY}/history/{pid}", timeout=60).json().get(pid)
        if item:
            status = item.get("status", {})
            if status.get("status_str") == "error":
                messages = [m for m in status.get("messages", []) if m and m[0] == "execution_error"]
                detail = messages[-1][1] if messages else status
                raise RuntimeError("ComfyUI failed: " + json.dumps(detail)[:1200])
            for out in item.get("outputs", {}).values():
                for img in out.get("images", []):
                    data = requests.get(f"{COMFY}/view", params={"filename": img["filename"],
                                        "subfolder": img.get("subfolder", ""), "type": img.get("type", "output")},
                                        timeout=120)
                    data.raise_for_status()
                    return Image.open(io.BytesIO(data.content)).convert("RGB")
        time.sleep(2)
    raise TimeoutError("FLUX.2 [klein] took longer than 20 minutes")


def upload(image, name):
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    buffer.seek(0)
    r = requests.post(f"{COMFY}/upload/image", files={"image": (name, buffer, "image/png")},
                      data={"type": "input", "overwrite": "true"}, timeout=120)
    r.raise_for_status()
    return r.json()["name"]


def blank(image):
    pixels = np.asarray(image, dtype=np.float32)
    return pixels.mean() < 6 or pixels.std() < 3


def klein(prompt, seed, width, height, reference=None, canvas=None, mask=None):
    """Run klein; a blank (fp16 overflow) result restarts ComfyUI once with an fp32 text encoder."""
    ensure_comfy()
    for attempt in range(2):
        names = {"reference": upload(reference, "reference.png") if reference is not None else None,
                 "canvas": upload(canvas, "canvas.png") if canvas is not None else None,
                 "mask": upload(mask.convert("RGB"), "mask.png") if mask is not None else None}
        image = run_comfy(klein_workflow(prompt, seed, width, height, **names))
        if not blank(image):
            return image
        if attempt == 0 and not COMFY_STATE["fp32_text"]:
            print("Blank FLUX.2 output: restarting ComfyUI with an fp32 text encoder", flush=True)
            COMFY_STATE["fp32_text"] = True
            start_comfy()
    raise RuntimeError("FLUX.2 [klein] produced a blank image")


def snap16(value):
    return max(512, int(round(int(value) / 16)) * 16)


def ai_shot(target, plan, seed):
    width, height = int(target["width"]), int(target["height"])
    prompt = plan.get("ai_prompt") or plan["scene_prompt"]
    image = klein(prompt, seed, snap16(width), snap16(height), reference=Image.open(REFERENCE_PATH).convert("RGB"))
    if image.size != (width, height):
        image = ImageOps.fit(image, (width, height), Image.Resampling.LANCZOS)
    return image, prompt
`;

const CELL_GENERATE = `
STEPS = 30  # RealVisXL fallback only
QUALITY = ("professional jewellery advertising photograph, photorealistic, shot on an 85mm lens, soft studio "
           "lighting, sharp focus, rich detail, natural skin texture, elegant composition")
NEGATIVE = ("duplicate jewellery, extra jewellery, second necklace, extra earrings, extra rings, floating objects, "
            "deformed hands, extra fingers, missing fingers, bad anatomy, distorted face, cross-eyed, text, letters, "
            "watermark, logo, signature, lowres, blurry, jpeg artifacts, cartoon, illustration, cgi, 3d render, "
            "oversaturated, overexposed")
LOGO_NEGATIVE = ("text, letters, words, typography, numbers, watermark, signature, people, hands, clutter, busy "
                 "pattern, lowres, blurry, cartoon")


def load_generator():
    from diffusers import AutoencoderKL, DPMSolverMultistepScheduler, StableDiffusionXLInpaintPipeline
    vae = AutoencoderKL.from_pretrained(MODELS["vae"], torch_dtype=torch.float16)
    pipe = StableDiffusionXLInpaintPipeline.from_pretrained(
        MODELS["generator"], vae=vae, torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(
        pipe.scheduler.config, use_karras_sigmas=True, algorithm_type="dpmsolver++")
    pipe.to(GEN_DEVICE)
    pipe.enable_vae_slicing()
    pipe.enable_vae_tiling()
    pipe.set_progress_bar_config(disable=True)
    return pipe


def snap(value):
    return max(512, int(value) // 8 * 8)


def layout(width, height, place):
    """The product layer (RGBA, frame-sized) and the inpaint mask (white = paint, black = keep the product)."""
    product = PRODUCT
    if PRODUCT_MODE == "frame":
        place = {"x": 0.5, "y": 0.5, "scale": 0.86}
    target_w = width * place["scale"]
    target_h = target_w * product.height / product.width
    if target_h > height * 0.8:
        target_h = height * 0.8
        target_w = target_h * product.width / product.height
    size = (max(8, int(target_w)), max(8, int(target_h)))
    scaled = product.resize(size, Image.Resampling.LANCZOS)
    cx = min(max(place["x"] * width, size[0] / 2), width - size[0] / 2)
    cy = min(max(place["y"] * height, size[1] / 2), height - size[1] / 2)
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    layer.paste(scaled, (int(cx - size[0] / 2), int(cy - size[1] / 2)))
    alpha = layer.getchannel("A")
    keep = alpha.point(lambda v: 255 if v > 90 else 0).filter(ImageFilter.MaxFilter(5))
    paint = keep.point(lambda v: 255 - v)
    return layer, paint


def initial_canvas(width, height, layer):
    """Blurred source colours under the product: a colour hint for the painter."""
    base = ImageOps.fit(source, (width, height), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(40))
    base = base.convert("RGBA")
    base.alpha_composite(layer)
    return base.convert("RGB")


def composite(generated, layer, kind):
    """Contact shadow + the untouched product pixels on top of the painted scene."""
    alpha = layer.getchannel("A")
    width, height = generated.size
    out = generated.convert("RGB")
    if PRODUCT_MODE == "cutout":
        strength = 0.3 if kind in ("closeup", "scene") else 0.16
        shadow = Image.new("L", (width, height), 0)
        shadow.paste(alpha, (0, max(2, int(height * 0.006))))
        shadow = shadow.filter(ImageFilter.GaussianBlur(max(3, width * 0.012)))
        shade = np.asarray(shadow, dtype=np.float32)[..., None] / 255.0 * strength
        out = Image.fromarray((np.asarray(out, dtype=np.float32) * (1 - shade)).clip(0, 255).astype(np.uint8))
    out.paste(layer.convert("RGB"), (0, 0), alpha.filter(ImageFilter.GaussianBlur(0.6)))
    return out


def judge(candidate_path, target, plan):
    """Runs on GPU 1 in a worker thread while GPU 0 paints the next take."""
    if not JUDGE:
        return None
    text = ("Image 1 is the real jewellery product. Image 2 is a generated advertising photo that must show exactly "
            "that product. Shot direction: " + words(plan["scene_prompt"], 60) + ". Score image 2 from 0 to 10 as a "
            "premium jewellery advert, strictly: the product appears exactly once and no extra or duplicate jewellery "
            "was added; it sits naturally at a believable size (worn, held or resting correctly, edges blend in, no "
            "halo or cut-out look, its lighting and shadow match the scene); faces, hands and fingers look "
            "anatomically correct; the photo looks like a real high-end camera shot (no plastic skin, smearing, "
            "warped background or AI artefacts); the scene matches the direction; no text or watermark. A 9 or 10 must "
            "be publishable as is. " +
            ("The product was redrawn by AI: compare it closely with image 1 — design, motifs, stones, stone count, "
             "metal colour and proportions must match; any visible change scores at most 4. " if MODE == "ai" else "") +
            'Answer with JSON only: {"score": 7, "issues": "short reason"}')
    try:
        result = parse_json(ask_vlm([source_path, candidate_path], text, max_new_tokens=160))
        return clamp(result.get("score"), 0, 10, 5.0), str(result.get("issues", ""))[:200]
    except Exception:
        traceback.print_exc()
        return None


def prefer_second(first, second, plan):
    """Head-to-head between the two best takes when their scores are within a point."""
    text = ("Image 1 is the real jewellery product. Images 2 and 3 are two generated advertising photos of it for: " +
            words(plan["scene_prompt"], 50) + ". Which is the better finished advert — the product looks exactly like "
            "image 1 and appears once at a natural size, people and hands look real, the light is believable and it "
            'looks like a real premium photo? Answer with JSON only: {"better": 2} or {"better": 3}')
    try:
        answer = parse_json(ask_vlm([source_path, first["path"], second["path"]], text, max_new_tokens=40))
        return int(answer.get("better", 2)) == 3
    except Exception:
        traceback.print_exc()
        return False


def font_file():
    path = "/tmp/brand-font.ttf"
    if not os.path.exists(path):
        for url in ("https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf",
                    "https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf"):
            try:
                response = requests.get(url, timeout=60)
                response.raise_for_status()
                open(path, "wb").write(response.content)
                break
            except Exception as exc:
                print("font download failed:", exc, flush=True)
    for candidate in (path, "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"):
        if os.path.exists(candidate):
            return candidate
    return None


def brand_font(path, size):
    if not path:
        return ImageFont.load_default()
    font = ImageFont.truetype(path, size)
    try:
        font.set_variation_by_name("Bold")
    except Exception:
        pass
    return font


def typeset_name(image, name):
    """Gold-gradient business name, centred under the emblem, with a soft shadow and a thin rule below."""
    width, height = image.size
    name = " ".join(str(name).split()) or "Jewellers"
    lines = [name]
    if len(name) > 14 and " " in name:
        cut = min((i for i, ch in enumerate(name) if ch == " "), key=lambda i: abs(i - len(name) / 2))
        lines = [name[:cut], name[cut + 1:]]
    path = font_file()
    size = int(width * 0.16)
    while size > 18:
        font = brand_font(path, size)
        widest = max(font.getbbox(line)[2] - font.getbbox(line)[0] for line in lines)
        if widest <= width * 0.84:
            break
        size -= 2
    font = brand_font(path, size)
    line_h = int(size * 1.18)
    block_h = line_h * len(lines)
    top = int(height * 0.56 - block_h / 2)
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    for i, line in enumerate(lines):
        box = font.getbbox(line)
        draw.text(((width - (box[2] - box[0])) / 2 - box[0], top + i * line_h), line, font=font, fill=255)
    rule_y = top + block_h + int(size * 0.25)
    draw.rectangle([int(width * 0.32), rule_y, int(width * 0.68), rule_y + max(2, size // 22)], fill=255)
    gradient = np.zeros((height, width, 3), dtype=np.float32)
    stops = np.array([[249, 226, 156], [212, 166, 64], [168, 116, 26], [236, 200, 110]], dtype=np.float32)
    t = ((np.arange(height, dtype=np.float32) - top) / max(1, rule_y - top)).clip(0, 1)[:, None]
    pos = t * (len(stops) - 1)
    lo = np.floor(pos).astype(int).clip(0, len(stops) - 2)
    frac = pos - lo
    gradient[:] = (stops[lo[:, 0]] * (1 - frac) + stops[lo[:, 0] + 1] * frac)[:, None, :]
    gold = Image.fromarray(gradient.clip(0, 255).astype(np.uint8))
    out = image.convert("RGB")
    shadow = Image.new("RGB", (width, height), (0, 0, 0))
    out.paste(shadow, (0, 0), mask.filter(ImageFilter.GaussianBlur(max(2, size // 14))).point(lambda v: int(v * 0.7)))
    out.paste(gold, (0, 0), mask)
    return out


def logo_backdrop(pipe, target, seed, callback):
    width, height = snap(target["width"]), snap(target["height"])
    prompt = ("luxury jewellery brand backdrop, deep black velvet texture with a subtle warm gold glow, a small ornate "
              "gold emblem with a diamond motif in the upper third, wide empty dark space in the middle and lower half")
    result = pipe(prompt=prompt, prompt_2="minimal premium brand identity, high contrast, ultra detailed",
                  negative_prompt=LOGO_NEGATIVE, image=Image.new("RGB", (width, height), (12, 10, 8)),
                  mask_image=Image.new("L", (width, height), 255), width=width, height=height, strength=1.0,
                  guidance_scale=6.5, num_inference_steps=STEPS,
                  generator=torch.Generator(device=GEN_DEVICE).manual_seed(seed),
                  callback_on_step_end=callback).images[0]
    return typeset_name(result, JOB["title"]), prompt


def product_shot(pipe, target, plan, seed, callback):
    width, height = snap(target["width"]), snap(target["height"])
    layer, paint = layout(width, height, plan["placement"] or placement_for(target["kind"], None))
    result = pipe(prompt=plan["scene_prompt"], prompt_2=QUALITY, negative_prompt=NEGATIVE,
                  image=initial_canvas(width, height, layer), mask_image=paint, width=width, height=height,
                  strength=1.0, guidance_scale=6.0, num_inference_steps=STEPS,
                  generator=torch.Generator(device=GEN_DEVICE).manual_seed(seed),
                  callback_on_step_end=callback).images[0]
    if result.size != (width, height):
        result = result.resize((width, height), Image.Resampling.LANCZOS)
    return composite(result, layer, target["kind"]), plan["scene_prompt"]


PLACEHOLDER = (128, 126, 122)


def klein_paint(target, plan, seed):
    """exact mode: klein sees the product pinned on a grey placeholder (reference) and paints only the grey (mask);
    the untouched product pixels and a contact shadow then go back on top."""
    width, height = int(target["width"]), int(target["height"])
    gen_w, gen_h = snap16(width), snap16(height)
    layer, paint = layout(gen_w, gen_h, plan["placement"] or placement_for(target["kind"], None))
    canvas = Image.new("RGBA", (gen_w, gen_h), PLACEHOLDER + (255,))
    canvas.alpha_composite(layer)
    canvas = canvas.convert("RGB")
    prompt = ("Replace the plain grey placeholder around the jewellery in image 1 with a photorealistic scene: " +
              plan["scene_prompt"] + ". The jewellery stays exactly where it is, at the same size, unchanged and shown "
              "only once; no other jewellery. " + QUALITY + ".")
    result = klein(prompt, seed, gen_w, gen_h, reference=canvas, canvas=canvas, mask=paint)
    if result.size != (gen_w, gen_h):
        result = result.resize((gen_w, gen_h), Image.Resampling.LANCZOS)
    out = composite(result, layer, target["kind"])
    if out.size != (width, height):
        out = ImageOps.fit(out, (width, height), Image.Resampling.LANCZOS)
    return out, plan["scene_prompt"]


def klein_logo(target, seed):
    width, height = int(target["width"]), int(target["height"])
    prompt = ("Luxury jewellery brand backdrop: deep black velvet texture with a subtle warm gold glow, a small ornate "
              "gold emblem with a diamond motif in the upper third, wide empty dark space in the middle and lower "
              "half. Minimal premium brand identity, high contrast, ultra detailed. No text, letters or words.")
    image = klein(prompt, seed, snap16(width), snap16(height))
    if image.size != (width, height):
        image = ImageOps.fit(image, (width, height), Image.Resampling.LANCZOS)
    return typeset_name(image, JOB["title"]), prompt


ENGINE = {"name": "klein", "ok": 0, "sdxl": None}


def sdxl():
    if ENGINE["sdxl"] is None:
        report.send("imageGeneration", 22, "Loading RealVisXL (fallback image generator)", force=True)
        ENGINE["sdxl"] = load_generator()
    return ENGINE["sdxl"]


def make_shot(target, plan, seed, on_step):
    """klein for every shot; exact and logo jobs fall back to RealVisXL if klein never managed a single image."""
    if ENGINE["name"] == "klein":
        try:
            if JOB["type"] == "logo":
                result = klein_logo(target, seed)
            elif MODE == "ai":
                result = ai_shot(target, plan, seed)
            else:
                result = klein_paint(target, plan, seed)
            ENGINE["ok"] += 1
            return result
        except Exception:
            if MODE == "ai" or ENGINE["ok"]:
                raise
            traceback.print_exc()
            print("FLUX.2 [klein] unavailable: falling back to RealVisXL", flush=True)
            ENGINE["name"] = "sdxl"
            if COMFY_STATE["proc"] is not None:
                COMFY_STATE["proc"].terminate()
                time.sleep(3)
    if JOB["type"] == "logo":
        return logo_backdrop(sdxl(), target, seed, on_step)
    return product_shot(sdxl(), target, plan, seed, on_step)


try:
    from concurrent.futures import ThreadPoolExecutor
    JUDGES = ThreadPoolExecutor(max_workers=1) if JUDGE else None  # GPU 1, in parallel with painting on GPU 0
    TAKES = 4 if JUDGE else 1  # quality over speed: up to 4 takes per shot, the judge keeps the best
    report.send("imageGeneration", 20, "Preparing the FLUX.2 [klein] image engine", force=True)
    total = max(1, len(JOB["targets"]))
    failures = []
    for position, target in enumerate(JOB["targets"]):
        idx = int(target["index"])
        plan = PLANS.get(idx) or fallback_plan(target)
        lo = 22 + 76 * position / total
        hi = 22 + 76 * (position + 1) / total
        label = f"image {position + 1}/{total}"
        try:
            takes, errors = [], []
            for attempt in range(TAKES):
                scored = [t["future"].result() for t in takes if t["future"] and t["future"].done()]
                if any(v and v[0] >= 9 for v in scored):
                    break  # already publishable
                span = (hi - lo) / TAKES
                start = lo + span * attempt
                report.send("imageGeneration", start, f"Painting {label}" +
                            (f" · take {attempt + 1}/{TAKES}" if TAKES > 1 else ""), force=True, imageIndex=idx)

                def on_step(pipe, step, timestep, kwargs, start=start, span=span, attempt=attempt):
                    if step % 5 == 0:
                        report.send("imageGeneration", start + span * step / STEPS,
                                    f"Painting {label}" + (f" · take {attempt + 1}" if TAKES > 1 else "") +
                                    f" · step {step + 1}/{STEPS}", imageIndex=idx)
                    return kwargs

                try:
                    image, used_prompt = make_shot(target, plan, random.randrange(2**31 - 1), on_step)
                except Exception as exc:
                    traceback.print_exc()
                    errors.append(f"{type(exc).__name__}: {exc}")
                    free_gpu()
                    if MODE == "ai" and COMFY_STATE["info"] is None:
                        raise  # the image engine never started: every take would fail the same way
                    continue
                path = os.path.join(OUT_DIR, f"image-{idx}-{attempt}.jpg")
                image.save(path, "JPEG", quality=95, optimize=True)
                del image
                takes.append({"path": path, "prompt": used_prompt, "take": attempt + 1,
                              "future": JUDGES.submit(judge, path, target, plan) if JUDGES else None})
            if not takes:
                raise RuntimeError(errors[-1] if errors else "no take was produced")
            for take in takes:
                verdict = take["future"].result() if take["future"] else None
                take["score"] = verdict[0] if verdict else 5.0
                if verdict:
                    print(f"{label} take {take['take']}: score {take['score']:.1f} — {verdict[1]}", flush=True)
            takes.sort(key=lambda t: t["score"], reverse=True)
            if JUDGE and len(takes) > 1 and takes[0]["score"] - takes[1]["score"] <= 1 and prefer_second(
                    takes[0], takes[1], plan):
                takes[0], takes[1] = takes[1], takes[0]
            best = takes[0]
            if JUDGE:
                report.send("imageReview", hi - 0.5, f"{label.capitalize()}: kept take {best['take']} of "
                            f"{len(takes)} ({best['score']:.0f}/10)", force=True, imageIndex=idx)
            with open(best["path"], "rb") as image_file:
                requests.put(target["uploadUrl"], data=image_file, headers={"Content-Type": "image/jpeg"},
                             timeout=300).raise_for_status()
            report.send("imageDone", hi, f"{label.capitalize()} ready", force=True, imageIndex=idx,
                        imagePrompt=str(best["prompt"])[:4000], motionPrompt=str(plan.get("motion_prompt") or "")[:2000],
                        qualityScore=best["score"])
        except Exception as exc:
            traceback.print_exc()
            failures.append(idx)
            free_gpu()
            report.send("imageFailed", hi, f"Image {idx} failed: {type(exc).__name__}: {exc}", force=True,
                        imageIndex=idx)

    if len(failures) == len(JOB["targets"]):
        raise RuntimeError("Every image failed: " + ", ".join(map(str, failures)))
    report.send("completed", 100, f"Done ({total - len(failures)}/{total} images)", status="completed", force=True,
                failedImages=failures)
except Exception as exc:
    traceback.print_exc()
    report.send("failed", 0, f"{type(exc).__name__}: {exc}", status="failed", force=True)
    raise
`;

/** Python string literal holding a JSON document (JSON escapes are valid Python string escapes). */
const pyJson = (value: unknown): string => JSON.stringify(JSON.stringify(value));

export function buildImageWorkerNotebook(job: ImageNotebookJob): Record<string, unknown> {
  // Function replacements: a `$` in the job (titles, URLs) must not be read as a replacement pattern.
  const setup = CELL_SETUP.replace('__JOB_JSON__', () => pyJson(job)).replace('__MODELS_JSON__', () =>
    pyJson(IMAGE_MODELS),
  );
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
        `# ByajBazaar marketing image worker\n\n` +
          `Auto-generated for job \`${job.jobId}\` — do not edit. Qwen3-VL plans the shots and judges every take on ` +
          `GPU 1; FLUX.2 [klein] paints on GPU 0 — around the untouched BiRefNet cut-out (exact mode) or the whole ` +
          `photo from the product reference (AI mode). RealVisXL is only a fallback.`,
      ),
      code(setup),
      code(CELL_ENGINE),
      code(CELL_ANALYST),
      code(CELL_CUTOUT),
      code(CELL_GENERATE),
    ],
  };
}
