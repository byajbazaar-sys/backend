import { ImageNotebookJob } from './image-notebook-job';

/** Hugging Face models the image notebook downloads (all public, no token needed). Also checked by account setup. */
export const IMAGE_MODELS = {
  generator: 'OzzyGT/RealVisXL_V4.0_inpainting',
  vae: 'madebyollin/sdxl-vae-fp16-fix',
  segmenter: 'ZhengPeng7/BiRefNet',
  analystLarge: 'Qwen/Qwen3-VL-8B-Instruct',
  analystSmall: 'Qwen/Qwen3-VL-4B-Instruct',
} as const;

const md = (source: string) => ({ cell_type: 'markdown', metadata: {}, source });
const code = (source: string) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source });

const CELL_SETUP = `
import os, sys, json, time, subprocess, traceback, threading, io, re, gc, random, math
os.environ.setdefault("HF_HOME", "/tmp/hf")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "websocket-client", "requests"], check=False)
import requests, websocket

JOB = json.loads(__JOB_JSON__)
MODELS = json.loads(__MODELS_JSON__)


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
    subprocess.run([sys.executable, "-m", "pip", "install", "-q",
                    "transformers>=4.57,<5", "diffusers>=0.34", "accelerate>=1.2", "bitsandbytes>=0.45",
                    "safetensors", "pillow", "timm", "kornia", "einops"], check=True)
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
    from transformers import AutoProcessor, BitsAndBytesConfig, Qwen3VLForConditionalGeneration
    quantization = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True,
                                      bnb_4bit_compute_dtype=torch.float16)
    VLM = Qwen3VLForConditionalGeneration.from_pretrained(
        VLM_ID, torch_dtype=torch.float16, quantization_config=quantization,
        device_map={"": VLM_DEVICE}, low_cpu_mem_usage=True)
    VLM.eval()
    VLM_PROCESSOR = AutoProcessor.from_pretrained(VLM_ID)


def unload_vlm():
    global VLM, VLM_PROCESSOR
    VLM, VLM_PROCESSOR = None, None
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
    "Answer with JSON only, exactly this shape: "
    '{"product_facts": "...", "shots": [{"index": 0, "scene_prompt": "...", '
    '"placement": {"x": 0.5, "y": 0.5, "scale": 0.5}, "motion_prompt": "..."}]}. '
    "Include every requested index exactly once."
)


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
    for attempt in range(2):
        try:
            result = parse_json(ask_vlm([source_path], request, max_new_tokens=1600))
            print("Product facts:", result.get("product_facts", ""), flush=True)
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


try:
    if JOB["type"] != "logo":
        report.send("imageCutout", 16, "Cutting out the jewellery", force=True)
        try:
            mask = segment(source)
            values = np.asarray(mask, dtype=np.float32) / 255.0
            solid = values > 0.5
            coverage = float(solid.mean())
            print(f"Product mask covers {coverage * 100:.1f}% of the photo", flush=True)
            if not 0.003 < coverage < 0.88:
                raise ValueError(f"mask coverage {coverage:.3f} out of range")
            ys, xs = np.where(solid)
            pad = int(max(source.size) * 0.015)
            box = (int(max(0, xs.min() - pad)), int(max(0, ys.min() - pad)),
                   int(min(source.width, xs.max() + pad + 1)), int(min(source.height, ys.max() + pad + 1)))
            PRODUCT = source.crop(box).convert("RGBA")
            PRODUCT.putalpha(mask.crop(box))
            PRODUCT_MODE = "cutout"
        except Exception as exc:
            print("Cut-out not usable, keeping the whole photo:", exc, flush=True)
            PRODUCT = feathered_frame(source)
            PRODUCT_MODE = "frame"
        report.send("imageCutout", 19, "Jewellery cut out" if PRODUCT_MODE == "cutout" else "Using the full photo",
                    force=True)
except Exception as exc:
    traceback.print_exc()
    report.send("failed", 15, f"Product cut-out failed: {type(exc).__name__}: {exc}", status="failed", force=True)
    raise
`;

const CELL_GENERATE = `
STEPS = 30
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
    if not JUDGE:
        return None
    text = ("Image 1 is the real jewellery product. Image 2 is a generated advertising photo that must show exactly "
            "that product. Shot direction: " + words(plan["scene_prompt"], 60) + ". Score image 2 from 0 to 10 for a "
            "jewellery advert: the product appears exactly once and no extra or duplicate jewellery was added; it sits "
            "naturally at a believable size (worn, held or resting correctly); faces, hands and fingers look "
            "anatomically correct; the scene matches the direction; no text or watermark. "
            'Answer with JSON only: {"score": 7, "issues": "short reason"}')
    try:
        result = parse_json(ask_vlm([source_path, candidate_path], text, max_new_tokens=160))
        return clamp(result.get("score"), 0, 10, 5.0), str(result.get("issues", ""))[:200]
    except Exception:
        traceback.print_exc()
        return None


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


try:
    report.send("imageGeneration", 20, "Loading RealVisXL image generator", force=True)
    generator = load_generator()
    total = max(1, len(JOB["targets"]))
    failures = []
    for position, target in enumerate(JOB["targets"]):
        idx = int(target["index"])
        plan = PLANS.get(idx) or fallback_plan(target)
        lo = 22 + 76 * position / total
        hi = 22 + 76 * (position + 1) / total
        tries = 3 if JUDGE else 1
        label = f"image {position + 1}/{total}"
        try:
            best = None  # (score, path, prompt)
            for attempt in range(tries):
                span = (hi - lo) / tries
                start = lo + span * attempt

                def on_step(pipe, step, timestep, kwargs, start=start, span=span, attempt=attempt):
                    if step % 5 == 0:
                        report.send("imageGeneration", start + span * step / STEPS,
                                    f"Generating {label}" + (f" · take {attempt + 1}" if tries > 1 else "") +
                                    f" · step {step + 1}/{STEPS}", imageIndex=idx)
                    return kwargs

                seed = random.randrange(2**31 - 1)
                if JOB["type"] == "logo":
                    image, used_prompt = logo_backdrop(generator, target, seed, on_step)
                else:
                    image, used_prompt = product_shot(generator, target, plan, seed, on_step)
                path = os.path.join(OUT_DIR, f"image-{idx}-{attempt}.jpg")
                image.save(path, "JPEG", quality=95, optimize=True)
                del image
                verdict = judge(path, target, plan)
                score = verdict[0] if verdict else 5.0
                if verdict:
                    print(f"{label} take {attempt + 1}: score {score:.1f} — {verdict[1]}", flush=True)
                    report.send("imageReview", start + span, f"{label.capitalize()} take {attempt + 1} scored "
                                f"{score:.0f}/10", force=True, imageIndex=idx)
                if best is None or score > best[0]:
                    best = (score, path, used_prompt)
                free_gpu()
                if not verdict or score >= 8 or (attempt >= 1 and best[0] >= 6):
                    break
            with open(best[1], "rb") as image_file:
                requests.put(target["uploadUrl"], data=image_file, headers={"Content-Type": "image/jpeg"},
                             timeout=300).raise_for_status()
            report.send("imageDone", hi, f"{label.capitalize()} ready", force=True, imageIndex=idx,
                        imagePrompt=str(best[2])[:4000], motionPrompt=str(plan.get("motion_prompt") or "")[:2000],
                        qualityScore=best[0])
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
          `Auto-generated for job \`${job.jobId}\` — do not edit. BiRefNet cuts the product out, Qwen3-VL plans and ` +
          `reviews the shots, and RealVisXL paints the scene around the untouched product.`,
      ),
      code(setup),
      code(CELL_ANALYST),
      code(CELL_CUTOUT),
      code(CELL_GENERATE),
    ],
  };
}
