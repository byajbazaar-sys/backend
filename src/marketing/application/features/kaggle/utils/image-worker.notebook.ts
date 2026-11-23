import { ImageNotebookJob } from './image-notebook-job';
import { PRODUCT_RESTORE_PY } from './product-restore.notebook';

/**
 * Models the image notebook uses — the strongest that run on Kaggle's T4 × 2 (no lighter fallbacks). Also checked
 * by account setup and stored in the per-account model cache.
 */
export const IMAGE_MODELS = {
  /**
   * Cuts the jewellery out of the product photo (both modes: exact mode pastes it, AI mode restores it). The HR
   * variant runs at 2048 px with the aspect kept, so thin chains, bells and filigree survive (MIT).
   */
  segmenter: 'ZhengPeng7/BiRefNet_HR',
  /** Plans every shot and judges every take (4-bit on GPU 1, Apache-2.0). */
  analyst: 'Qwen/Qwen3-VL-8B-Instruct',
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
} as const;

/** pip packages the image notebook needs (a warm worker session also installs them at boot, in the background). */
export const IMAGE_PIP_PACKAGES = [
  'transformers>=4.57,<5',
  'accelerate>=1.2',
  'bitsandbytes>=0.45',
  'safetensors',
  'pillow',
  'timm',
  'kornia',
  'einops',
];

const md = (source: string) => ({ cell_type: 'markdown', metadata: {}, source });
const code = (source: string) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source });

const CELL_SETUP = `
import os, sys, json, time, subprocess, traceback, threading, io, re, gc, random, math, uuid, hashlib
os.environ.setdefault("HF_HOME", "/tmp/hf")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "websocket-client", "requests"], check=False)
import requests, websocket

JOB = json.loads(__JOB_JSON__)
MODELS = json.loads(__MODELS_JSON__)
IMAGE_PIP = json.loads(__PIP_JSON__)
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
        self.ws, self.lock, self.send_lock = None, threading.Lock(), threading.Lock()
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
        self._enqueue(payload, wait=bool(status))

    def _enqueue(self, payload, wait):
        """Delivery happens on a background thread, so a slow or dropped socket never stalls the GPU work; a final
        event (status set) waits until everything before it was delivered."""
        import queue as _queue
        with self.lock:
            if getattr(self, "outbox", None) is None:
                self.outbox = _queue.Queue()
                threading.Thread(target=self._pump, daemon=True).start()
        self.outbox.put(payload)
        if wait:
            self.outbox.put(None)  # the pump stops (and closes the socket) after the final event
            deadline = time.time() + 90
            while getattr(self, "outbox", None) is not None and time.time() < deadline:
                time.sleep(0.1)

    def _pump(self):
        box = self.outbox
        while True:
            payload = box.get()
            if payload is None:
                break
            try:
                self._deliver(payload)
            except Exception as exc:
                print("progress delivery failed:", exc, flush=True)
        with self.lock:
            try:
                self.ws and self.ws.close()
            except Exception:
                pass
            self.ws, self.outbox = None, None

    def _deliver(self, payload):
        with self.send_lock:
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


def with_retries(what, fn, attempts=4):
    """fn() with backoff on network errors; a client error (expired or wrong URL) fails at once."""
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except requests.RequestException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if attempt == attempts or (status is not None and 400 <= status < 500 and status not in (408, 429)):
                raise
            print(f"{what} failed ({exc}); retry {attempt}/{attempts - 1}", flush=True)
            time.sleep(min(30, 3 * 2 ** (attempt - 1)))



def wait_boot(key, message, progress, stage="imageSetup"):
    """Warm session: wait for one of the session's background setup steps (packages installed, or model files copied
    from the read-only cache to the local disk). Standalone runs have no such steps and never wait."""
    event = WORKER.get("boot", {}).get(key)
    if event is not None and not event.is_set():
        report.send(stage, progress, message, force=True)
        started = time.time()
        event.wait(1500)
        print(f"waited {time.time() - started:.0f}s for the session's {key} step", flush=True)


try:
    wait_boot("image_packages", "Finishing the image packages install", 2)
    if not WORKER.get("image_packages"):
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", *IMAGE_PIP], check=True)
        WORKER["image_packages"] = True
    if not JOB.get("hfToken"):
        raise RuntimeError("MARKETING_HF_TOKEN is not set: FLUX.2 [klein] 9B is gated on Hugging Face")
    try:
        import cv2
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "opencv-python-headless"], check=True)
        import cv2
    import numpy as np
    import torch
    from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

    # The metal the jeweller (form or inventory item) says it is: wins over what the analyst reads off the photo.
    KNOWN_METAL = {"gold": "yellow gold", "silver": "silver", "rose_gold": "rose gold",
                   "platinum": "platinum"}.get(str(JOB.get("metal") or "").lower())

    if not torch.cuda.is_available():
        raise RuntimeError("A Kaggle GPU is required (set the accelerator to GPU T4 x2).")
    GPU_COUNT = torch.cuda.device_count()
    GEN_DEVICE = "cuda:0"
    VLM_DEVICE = "cuda:1" if GPU_COUNT >= 2 else "cuda:0"
    # With a second GPU the analyst stays loaded and judges every candidate; on one GPU it is unloaded after planning.
    JUDGE = GPU_COUNT >= 2 and JOB["type"] != "logo"
    OUT_DIR = ("/kaggle/working" if os.path.isdir("/kaggle/working") else "/tmp") + "/marketing-images"
    os.makedirs(OUT_DIR, exist_ok=True)

    source = None
    source_path = None
    SOURCE_KEY = None  # hash of the photo's bytes: a warm session reuses its cut-out on the next job with this photo
    if JOB.get("sourceImageUrl"):
        report.send("imageSetup", 3, "Downloading the product photo", force=True)

        def get_source():
            r = requests.get(JOB["sourceImageUrl"], timeout=180)
            r.raise_for_status()
            return r.content
        content = with_retries("product photo download", get_source)
        SOURCE_KEY = hashlib.sha1(content).hexdigest()
        opened = ImageOps.exif_transpose(Image.open(io.BytesIO(content)))
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
VLM_ID = MODELS["analyst"]
# GPU_LOCK (engine cell): one model load or GPU call at a time in this process.


def free_gpu():
    with GPU_LOCK:
        gc.collect()
        torch.cuda.empty_cache()


def load_vlm():
    global VLM, VLM_PROCESSOR
    cached = WORKER.get("vlm")
    if cached and cached[0] == VLM_ID:  # warm session: already on its GPU
        _, VLM, VLM_PROCESSOR = cached
        return
    wait_boot("analyst", "Copying the image analyst to the local disk", 7, "imageAnalysis")
    from transformers import AutoProcessor, BitsAndBytesConfig, Qwen3VLForConditionalGeneration
    quantization = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True,
                                      bnb_4bit_compute_dtype=torch.float16)
    with GPU_LOCK, torch.cuda.device(VLM_DEVICE):
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
        [{"role": "user", "content": content}], tokenize=True, add_generation_prompt=True, return_dict=True,
        return_tensors="pt")
    # 4-bit kernels run on the *current* CUDA device: pin it to the analyst's GPU, and keep other GPU work out.
    with GPU_LOCK, torch.cuda.device(VLM_DEVICE), torch.inference_mode():
        inputs = inputs.to(VLM_DEVICE)
        generated = VLM.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
    generated = generated[:, inputs["input_ids"].shape[1]:]
    return VLM_PROCESSOR.batch_decode(generated, skip_special_tokens=True)[0].strip()


def parse_json(answer):
    start, end = answer.find("{"), answer.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(answer[start:end + 1])
        except ValueError:
            pass
    if start >= 0:
        # An answer cut off at the token limit (a long "issues" text): keep every field that was written in full.
        body = answer[start:]
        cut = body.rfind(",")
        while cut > 0:
            try:
                return json.loads(body[:cut] + "}")
            except ValueError:
                cut = body.rfind(",", 0, cut)
    raise ValueError("no JSON object in the answer: " + answer[:200])


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
    """The backend's own shot direction (it already describes only the surroundings) with default placement."""
    return {"scene_prompt": words(target["prompt"], 60),
            "ai_prompt": words(target["prompt"], 110) + ". Keep the exact jewellery from image 1 identical: same "
                         "design, stones, metal colour and proportions. Photorealistic advertising photograph.",
            "placement": placement_for(target["kind"], None)}


# One short call, asking only for what this mode uses: the box (cut-out / reference crop) plus, per shot, the
# placement and a product-aware scene (exact) or the full-photo prompt (ai). Motion prompts and product
# descriptions come from the backend's planner, so the analyst no longer writes them.
PLAN_COMMON = (
    "You are the art director of a jewellery advert. The image is the real product photo. "
    "product = 2 to 5 words naming the jewellery type and metal (e.g. 'gold kundan necklace'). "
    "metal = the metal colour you SEE in the photo, one of: silver, oxidised silver, yellow gold, antique gold, rose "
    "gold, white gold, platinum, two-tone — trust the photo over the shot direction (a grey-white shiny metal is "
    "silver, a dark brownish-gold one antique gold). "
    "colours = at most 8 words naming any enamel, meenakari or stone colours you see, or 'none'. "
    "pieces = how many separate jewellery items the photo shows (a pair of earrings or payals = 2, one ring = 1, a set "
    "of four bangles = 4). "
    "view = how the photo shows the piece: flat (laid flat and seen from above, or hanging straight and seen face-on, "
    "as necklaces, chains, pendants, tikkas, payals and coins usually are) or angled (standing or resting, seen from "
    "the side at an angle, as rings, bangles and kadas usually are). "
    "product_box = a tight box around ONLY the jewellery (no hands, fingers, boxes or props) as [x1, y1, x2, y2] in "
    "0-1000 coordinates of the image width and height. "
    "wearer = who the piece is made for, judged from its design: male (a broad or flat-topped signet ring, a gents "
    "kada, a heavy plain chain or bracelet), female (a mangalsutra, jhumkas, a nath, payal, a delicate or floral ring, a "
    "necklace set) or any. "
    "Each shot has people: people=none means the jewellery alone as a close-up product shot on its surface or prop — "
    "no person, face, hand, finger, wrist, neck or other body part anywhere in the photo, and never add one; "
    "people=model means exactly one adult model of the wearer's gender (a man for male pieces, a woman for female "
    "pieces), staged as the shot's staging says: worn = wearing it on the body; held = only gloved hands holding it, no "
    "face or body, nobody wearing it; presented = holding it out in an open box and wearing no copy of it. In every shot "
    "the piece appears exactly once and the model wears no other jewellery. ")
PLAN_EXACT = PLAN_COMMON + (
    "The real product cut-out is pasted into every shot unchanged. For each shot: placement = the product's centre "
    "(x and y from 0 to 1) and its width as a fraction of the frame width (scale 0.2 to 0.8) so it sits naturally "
    "(resting on its surface or prop, usually in the lower middle, large enough to show its detail); scene = the "
    "shot direction in at most 40 words describing ONLY the surroundings (surface, props, background, light) as a "
    "product close-up with no person or body part, calling it 'the jewellery' and never describing its design or "
    "adding other jewellery. "
    'JSON only: {"product": "<2-5 words>", "metal": "<the metal you see>", "colours": "<colours or none>", "pieces": <number>, '
    '"view": "<flat or angled>", "wearer": "<male, female or any>", "product_box": [<x1>, <y1>, <x2>, <y2>], "shots": [{"index": <shot index>, '
    '"placement": {"x": <0-1>, "y": <0-1>, "scale": <0.2-0.8>}, "scene": "<surroundings only>"}]}')
PLAN_AI = PLAN_COMMON + (
    "For each shot: ai_prompt = 50 to 90 words for an image-editing model that receives this photo as image 1, "
    "describing the finished photo (setting, surface or — only for people=model — the model, pose and outfit; light, "
    "camera) that follows the shot direction, calling the product 'the exact <product> from image 1' that must stay identical (design, motifs, "
    "stones, stone count, metal colour, proportions) at a realistic size, with no other jewellery. "
    "Name the metal you see in every ai_prompt. When a person wears it, describe exactly how it sits ON the body "
    "(a bangle or kada encircles the wrist with the hand through it, a necklace lies on the collarbones, earrings hang "
    "from the earlobes, a ring wraps the finger), touching the skin at its real-life size — never held up beside the "
    "face, floating, or looking pasted on. "
    'JSON only: {"product": "<2-5 words>", "metal": "<the metal you see>", "colours": "<colours or none>", "pieces": <number>, '
    '"view": "<flat or angled>", "wearer": "<male, female or any>", "product_box": [<x1>, <y1>, <x2>, <y2>], "shots": [{"index": <shot index>, '
    '"ai_prompt": "<50-90 words>"}]}')
# Mixed job (exact mode with an on-body shot): paste shots get placement + scene, redraw shots an ai_prompt.
PLAN_BOTH = PLAN_AI.split("JSON only:")[0] + (
    "Shots marked path=paste instead get placement (centre x, y from 0 to 1 and width as a fraction of the frame, "
    "0.2 to 0.8) and scene (at most 40 words, surroundings only). "
    'JSON only: {"product": "<2-5 words>", "metal": "<the metal you see>", "colours": "<colours or none>", "pieces": <number>, '
    '"view": "<flat or angled>", "wearer": "<male, female or any>", "product_box": [<x1>, <y1>, <x2>, <y2>], "shots": [{"index": <shot index>, '
    '"ai_prompt": "<redraw shots>", '
    '"placement": {"x": <0-1>, "y": <0-1>, "scale": <0.2-0.8>}, "scene": "<paste shots>"}]}')

ON_BODY_KINDS = {"present", "hands", "worn"}
WITH_PERSON = re.compile(r"\\b(model|person|woman|man|bride|groom|wearing|worn|wears)\\b", re.I)
# Any person or body part in a written shot: a product-only shot whose plan mentions one gets the backend's direction.
BODY = re.compile(r"\\b(models?|person|people|wom[ae]n|m[ae]n|lady|ladies|gentleman|bride|groom|girl|boy|wearing|worn|"
                  r"wears|hands?|fingers?|wrists?|forearms?|arms?|palms?|necks?|collarbones?|ears?|earlobes?|faces?|"
                  r"skin|shoulders?|chest)\\b", re.I)
WEARER = JOB.get("wearer") if JOB.get("wearer") in ("male", "female") else None  # the backend's hint wins
ADULT = {"male": "an adult Indian man", "female": "an adult Indian woman"}
OTHER_GENDER = {"male": re.compile(r"\\b(wom[ae]n'?s?|female|lady|ladies|girl|bride|she|her|hers)\\b", re.I),
                "female": re.compile(r"\\b(m[ae]n'?s?|male|gentleman|boy|groom|he|his|him)\\b", re.I)}


# Marketing shows the jewellery only — no model, no hands — unless a job explicitly allows people (none does now).
PEOPLE = bool(JOB.get("allowPeople"))


def shot_people(target):
    """model: the shot may show one adult model (on-body photoshoot kinds, or a campaign scene that names one);
    none: the jewellery alone, a product close-up — no person or body part. Always none while PEOPLE is off."""
    if not PEOPLE:
        return "none"
    if target["kind"] in ON_BODY_KINDS:
        return "model"
    if target["kind"] == "scene" and WITH_PERSON.search(str(target.get("prompt") or "")):
        return "model"
    return "none"


def shot_staging(target):
    """How the piece appears in a shot with people: worn (on the body — a photoshoot's worn shot, a campaign's model
    scene), held (a photoshoot's hands shot: gloved hands hold it, nobody wears it) or presented (a photoshoot's present
    shot: the model holds it out in an open box). None for product-only shots. Treating the hands and present shots as
    worn painted the chain on the neck AND in the gloves (two copies), and capped every correct take."""
    if shot_people(target) == "none":
        return None
    return {"hands": "held", "present": "presented"}.get(target["kind"], "worn")


# Wearing words in a held or presented shot's written plan: the piece then got drawn worn as well as held (twice).
# The outfit may be worn ("a woman wearing a lehenga"); the piece may not.
WEARING_WORDS = re.compile(r"\\b(?:wears|wearing|worn)\\s+(?:the |this |a |an |her |his )?(?:exact )?(?:[\\w-]+ ){0,3}?"
                           r"(?:piece|jewell?ery|chain|necklace|ring|bangle|kada|bracelet|earrings?|pendant|anklets?|"
                           r"payal|tikka|coin|mangalsutra|choker|nath)s?\\b|\\b(?:around|on) (?:her|his) (?:neck|wrist|"
                           r"ankle|finger|ears?)\\b", re.I)
PRODUCT_NAME = ""  # what the analyst calls the piece ("gold signet ring")
PIECES = None  # how many separate items the product photo shows (a pair of earrings = 2)
VIEW = None  # how the product photo shows the piece: "flat" (from above / face-on) or "angled"
# Where each kind of piece is worn and how the model shot is framed for it (a ring drawn as a pendant was the most
# common model-scene failure). Matched on the jeweller's title (else the analyst's name for the piece): the head noun
# wins (the match ending last; "nose ring" over "ring"), "set" only when nothing else matches.
WEAR_ON = [
    ("neck", r"mangal ?sutra", "around the neck, its chain and pendant lying on the collarbones", "framed from the chest up"),
    ("hand", r"ha+th ?phool|hand ?harness|\\bpanja\\b",
     "on the back of the hand, its chains linked to a ring on the finger and around the wrist",
     "a close-up of the hand resting gracefully"),
    ("nose", r"\\bnath\\b|\\bnathni\\b", "in the nose, its chain swept up to the hair", "a close bridal portrait"),
    ("nose", r"nose ?(?:rings?|pins?|studs?)|\\bnose\\b|nosepin|\\blaung\\b", "in the nose",
     "a close portrait, the nose in sharp focus"),
    ("toe", r"toe ?rings?|bich+h?iya", "on the second toe", "a close-up of the feet"),
    ("ear", r"ear ?cuffs?", "on the outer rim of the ear", "a close profile of the ear with the hair tucked back"),
    ("ear", r"ear ?chains?|kan ?chain|\\bsahara\\b", "hanging from the earlobe, its chain swept up into the hair",
     "a three-quarter portrait"),
    ("ear", r"ear ?rings?|jhumk\\w*|chandbali|\\bstuds?\\b|\\btops\\b|\\bbali\\b|hoops?\\b|danglers?|\\bdrops?\\b",
     "hanging from the earlobes", "a three-quarter portrait with the hair tucked behind the ear"),
    ("upper arm", r"armlets?|baju ?band|\\bvanki\\b",
     "clasped high on the upper arm around the biceps, near the shoulder (an armlet, not a bracelet)",
     "a sleeveless blouse, the upper arm in the centre of the frame, the wrists bare"),
    ("forehead", r"borla|rakhdi|maang ?tikka|\\btikka\\b", "at the centre of the forehead, hanging from the hair parting",
     "a close portrait"),
    ("forehead", r"matha ?patti", "on the head, its chains along the hairline across the forehead",
     "a close portrait of the face and hair"),
    ("hair", r"\\bpassa\\b|jhoomar|jhumar", "on the side of the head, pinned into the hair above the ear",
     "a three-quarter portrait"),
    ("hair", r"hair ?pins?|\\bjuda\\b|hair ?accessor\\w*|hair ?clips?|paranda", "in the hair bun",
     "seen from behind or the side, the bun in focus"),
    ("finger", r"\\brings?\\b|\\bbands?\\b|anguthi|solitaire",
     "on the ring finger, the band wrapped around the finger",
     "a close-up of the hand near the face or resting on the other hand, the ring large and sharp in the frame"),
    ("wrist", r"bangles?|\\bkadas?\\b|kangan|chooda|\\bchura\\b|bracelets?|\\bcuffs?\\b",
     "around the wrist, the hand passing through it",
     "the forearm across the body at chest height, the piece facing the camera"),
    ("ankle", r"anklets?|payal|pajeb|ghungroo|jhanjhar", "around the ankle", "a close-up of the feet"),
    ("waist", r"kamar ?bandh?|waist|\\bbelt\\b|kardhani", "around the waist", "framed from the chest to the knees"),
    ("held", r"\\bcoins?\\b|\\bbiscuits?\\b|\\bbars?\\b", "in both cupped palms",
     "a close-up of only the two cupped hands and wrists, no face or neck in the frame, the coin large and sharp"),
    ("neck", r"necklaces?|pendants?|\\bchains?\\b|\\bhaar\\b|choker|lockets?|\\bmala\\b|\\bhasli\\b|\\bkanthi\\b",
     "around the neck, lying on the collarbones", "framed from the chest up"),
]
WEAR_ON_WEAK = ("neck", r"\\bsets?\\b", "the necklace around the neck and any earrings at the ears",
                "a portrait from the chest up")
# What the judge may answer for each body part (a tikka hangs from the hair, a hathphool covers hand and finger...).
WORN_ON_OK = {"hand": {"hand", "finger", "wrist"}, "forehead": {"forehead", "hair"}, "hair": {"hair", "forehead", "ear"},
              "toe": {"toe", "ankle", "foot"}, "ankle": {"ankle", "toe", "foot"}, "upper arm": {"upper arm", "arm"},
              "held": {"held", "hand", "none"}}
KIDS = re.compile(r"\\b(kids?|baby|babies|child|children|infants?|newborn|toddlers?)\\b", re.I)
COUPLE = re.compile(r"\\bcouples?\\b|his (?:and|&) hers", re.I)


def placement_for_text(text):
    text = str(text or "").lower().split(" with ")[0]
    best = None
    for order, (part, pattern, where, framing) in enumerate(WEAR_ON):
        for m in re.finditer(pattern, text):
            key = (m.end(), m.end() - m.start(), -order)
            if best is None or key > best[0]:
                best = (key, (part, where, framing))
    if best:
        return best[1]
    if re.search(WEAR_ON_WEAK[1], text):
        return WEAR_ON_WEAK[0], WEAR_ON_WEAK[2], WEAR_ON_WEAK[3]
    return None


def wear_placement():
    """(body part, where, framing) for this piece, or None when its kind is not known."""
    return placement_for_text(JOB.get("title")) or placement_for_text(PRODUCT_NAME)


def is_kids():
    return bool(KIDS.search(str(JOB.get("title") or "")))


def is_couple():
    return bool(COUPLE.search(str(JOB.get("title") or "")))


def people_rule(target):
    """The sentence every take of the shot is painted with: who may (or may not) be in it."""
    if shot_people(target) == "none":
        return (" Product close-up: the jewellery alone, large in the frame on its surface, nothing in the photo but "
                "the setting and props — no person, no hand, no fingers, no body part.")
    placement = wear_placement()
    if is_couple():
        where, framing = (placement[1], placement[2]) if placement else ("", "a close-up")
        return (f" A couple's hands together — a man's and a woman's — each wearing one of the pair {where}; "
                f"{framing}. No other person in the photo.")
    staging = shot_staging(target)
    their = {"male": "his", "female": "her"}.get(WEARER, "their")
    if staging == "held":
        return (" Only the two gloved hands and the wrists are in the photo, holding the piece — no face, neck or body; "
                "nobody wears it, and it appears exactly once.")
    who = f"The one model is {ADULT[WEARER]}" if WEARER else "Exactly one adult model"
    bare = f" Apart from this piece {their} ears, neck, wrists and fingers are bare."
    if staging == "presented":
        return (f" {who}, holding the open box with the piece inside it; the piece appears exactly once, in the box, "
                f"and {their} ears, neck, wrists and fingers are bare. No other person in the photo.")
    if placement:
        part, where, framing = placement
        verb = "holding it" if part == "held" else "wearing the jewellery"
        return f" {who}, {verb} {where}; {framing}.{bare} No other person in the photo."
    return f" {who};{bare} no other person in the photo."


DISPLAY = {"finger": "a velvet ring cone", "toe": "a small velvet tray", "ear": "a velvet earring stand",
           "nose": "a small velvet tray", "forehead": "a velvet tray", "hair": "a velvet tray",
           "wrist": "a velvet bangle stand", "upper arm": "a velvet bangle stand", "hand": "a velvet tray",
           "ankle": "a velvet tray", "waist": "a velvet tray", "held": "a velvet coin tray"}


def with_display(text):
    """A bust (neck display) in a product shot of a ring, earring, bangle, payal or coin becomes the display that
    piece is shown on."""
    placement = wear_placement()
    if not placement or placement[0] == "neck":
        return text
    display = DISPLAY.get(placement[0], "a velvet tray")
    return re.sub(r"(?i)\\b(?:a |the )?(?:black )?(?:velvet )?(?:jewell?ery )?bust\\b", display, text)


UPRIGHT_DISPLAY = re.compile(r"\\b(bust|stand|cone|hooks?|hang\\w*|draped|easel)\\b", re.I)
TOP_DOWN = re.compile(r"\\b(from (directly )?above|top[- ]down|overhead|flat[- ]lay)\\b", re.I)


def flat_lay(text):
    """A piece photographed face-on (a necklace, tikka or coin) and pasted onto a surface seen at an angle stood up on
    it like a sculpture: its scene becomes a flat lay seen from directly above, so the two angles agree. On a bust or
    a stand it is shown face-on already."""
    if UPRIGHT_DISPLAY.search(text) or TOP_DOWN.search(text):
        return text
    return text.rstrip(". ") + ", photographed from directly above as a flat lay, the jewellery lying flat on the surface"


def held_text(text):
    """A held piece (a coin) described in wearing words — the backend's "worn by one adult model", the analyst's "as a
    pendant" — was drawn hanging from the neck above the cupped hands: the words become holding ones."""
    text = re.sub(r"(?i)\\s*\\b(?:as|on|from|hanging from)\\s+(?:a |an |the )?(?:[\\w-]+ ){0,3}(?:pendant|necklace|chain)\\b",
                  "", text)
    text = re.sub(r"(?i)\\s*\\b(?:at|on|around|against|over)\\s+(?:her|his|the)\\s+(?:collarbones?|neck|chest|throat)\\b",
                  "", text)
    text = re.sub(r"(?i)\\b(coins?)\\s+pendants?\\b", r"\\1", text)
    text = re.sub(r"(?i)\\bpendant\\b", "coin", text)
    text = re.sub(r"(?i)\\bworn by\\b", "held by", text)
    text = re.sub(r"(?i)\\bwearing\\b", "holding", text)
    text = re.sub(r"(?i)\\bwears\\b", "holds", text)
    return (text.rstrip(". ") + ". It is a loose coin lying in the open palms: no chain, no loop, nothing around the "
            "neck.")


def with_wearer(text):
    """The backend's 'one adult male or female model chosen to suit the piece' made specific once the wearer is known."""
    if not WEARER:
        return text
    who = "man" if WEARER == "male" else "woman"
    text = re.sub(r"(?i)\\b(adult\\s+)?male\\s+or\\s+female\\s+model\\b(\\s+chosen\\s+to\\s+suit\\s+the\\s+piece)?",
                  f"adult Indian {who}", text)
    return re.sub(r"(?i)\\b(man|woman)\\s+or\\s+(man|woman)\\b", who, text)


def path_for(target):
    """paste = exact mode's untouched cut-out on a painted scene (surfaces only: a flat photo cannot be worn);
    redraw = klein draws the piece in place — on a wrist, in a hand, in an open box — and the real pixels are restored
    on top wherever the drawing matches the photo."""
    if JOB["type"] == "logo":
        return "logo"
    if MODE == "ai" or shot_people(target) == "model":
        return "redraw"
    return "paste"


# Children are never generated: for kids' jewellery the model scene becomes a gentle product shot instead.
KIDS_SCENE = "on a soft pastel baby blanket beside a small wooden toy, gentle window light, a sweet and tender mood"
if is_kids():
    for _t in JOB["targets"]:
        if _t.get("kind") == "scene" and WITH_PERSON.search(str(_t.get("prompt") or "")):
            _t["prompt"], _t["restaged"] = KIDS_SCENE, True
PATHS = {int(t["index"]): path_for(t) for t in JOB["targets"]}
# The camera move of a re-staged scene's clip (the backend's motion for a model scene asks the model to hold still).
PRODUCT_MOTION = "very slow camera push-in, soft light gliding across the still metal"
DISPLAY_MOOD = {"festive": "warm festive bokeh and a few marigold petals around it",
                "luxury": "under a single dramatic spotlight, deep shadows",
                "studio": "a soft grey gradient backdrop and a thin rim light",
                "minimal": "soft daylight on pale linen, calm and airy"}


def display_scene():
    """A campaign's model scene re-staged as a product shot: the piece on the display it is shown on, in the
    campaign's mood (when no take of the model shot kept the real design or its place on the body)."""
    placement = wear_placement()
    where = ("a velvet jewellery bust" if placement and placement[0] == "neck" else
             DISPLAY.get(placement[0], "a velvet tray") if placement else "a velvet tray")
    return f"resting on {where}, {DISPLAY_MOOD.get(JOB.get('style'), DISPLAY_MOOD['studio'])}"

METAL = None  # the metal the analyst sees in the photo ("silver", "yellow gold", ...)
COLOURS = None  # the enamel / stone colours it sees
WHITE_METAL = re.compile(r"silver|platinum|white gold|steel", re.I)
OXIDISED = re.compile(r"oxidi[sz]ed|black(?:ened)? silver|antique silver|german silver", re.I)
DARK_SEEN = re.compile(r"oxidi|black|dark|antique|grey|gray|gunmetal|tarnish", re.I)


def title_metal():
    """The metal the jeweller's title names ("Gold Chain Bracelet with Agate" -> gold), or None (none, or both)."""
    text = re.split(r"(?i)\\s+with\\s+", str(JOB.get("title") or ""))[0].lower()
    for pattern, metal in ((r"rose\\s*gold", "rose gold"), (r"white\\s*gold", "white gold"), (r"platinum", "platinum"),
                           (r"oxidi[sz]ed", "oxidised silver")):
        if re.search(pattern, text):
            return metal
    gold, silver = bool(re.search(r"\\bgold(?:en)?\\b", text)), bool(re.search(r"\\bsilver\\b", text))
    return "gold" if gold and not silver else "silver" if silver and not gold else None


def metal_lock():
    """One sentence pinning the metal and enamel colours the photo shows: without it the image model drifts silver
    towards gold, especially under warm light."""
    if not METAL:
        return ""
    text = f"The jewellery is {METAL}"
    if COLOURS and COLOURS.lower() != "none":
        text += f" with {COLOURS}"
    text += f"; keep it exactly {METAL}"
    if OXIDISED.search(METAL):  # "white-grey" made klein polish a blackened piece bright silver
        text += " — a dark, blackened antique silver finish, deep grey-black with silver highlights, NOT bright polished silver, NOT gold"
    elif WHITE_METAL.search(METAL):
        text += " — a cool white-grey metal, NOT gold, NOT yellow, no golden tint"
    return text + ". "


def fit_metal(prompt):
    """The prompt with the metal lock up front; for a white metal also without gold wording, which tints the piece."""
    prompt = str(prompt or "")
    if METAL and WHITE_METAL.search(METAL):
        prompt = re.sub(r"(?i)\\byellow\\s+gold\\b|\\bgold\\b", METAL, prompt)
        prompt = re.sub(r"(?i)\\b(warm\\s+)?golden\\b", "soft", prompt)
        prompt = re.sub(r"(?i)\\bwarm tone\\b", "cool tone", prompt)
    return metal_lock() + prompt


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
    if not 0.0003 < area < 0.97:  # a nose pin or stud on a face is ~0.05 % of the photo
        return None
    w, h = source.size
    return (int(x1 / 1000 * w), int(y1 / 1000 * h), int(x2 / 1000 * w), int(y2 / 1000 * h))


def box_in(raw, size, min_area=0.0002, max_area=0.25):
    """0-1000 box -> pixels of an image of that size; None when unusable. Small allowed: a worn ring is ~0.1 % of it."""
    try:
        x1, y1, x2, y2 = [float(v) for v in raw][:4]
    except Exception:
        return None
    x1, x2 = sorted((max(0.0, min(1000.0, x1)), max(0.0, min(1000.0, x2))))
    y1, y2 = sorted((max(0.0, min(1000.0, y1)), max(0.0, min(1000.0, y2))))
    if not min_area < (x2 - x1) * (y2 - y1) / 1e6 < max_area:
        return None
    w, h = size
    return (int(x1 / 1000 * w), int(y1 / 1000 * h), int(np.ceil(x2 / 1000 * w)), int(np.ceil(y2 / 1000 * h)))


def padded_box(box, pad=0.06):
    x1, y1, x2, y2 = box
    px, py = int((x2 - x1) * pad) + 4, int((y2 - y1) * pad) + 4
    return (max(0, x1 - px), max(0, y1 - py), min(source.width, x2 + px), min(source.height, y2 + py))


def plan_shots():
    if JOB["type"] == "logo":  # nothing to analyse: the backdrop is painted from text, the name is typeset
        return {int(t["index"]): {"scene_prompt": t["prompt"], "placement": None} for t in JOB["targets"]}
    report.send("imageAnalysis", 7, f"Loading the image analyst ({VLM_ID.split('/')[-1]})", force=True)
    load_vlm()
    brief = [{"index": t["index"], "kind": t["kind"], "path": PATHS[int(t["index"])], "people": shot_people(t),
              **({"staging": shot_staging(t)} if shot_staging(t) else {}),
              "direction": words(t["prompt"], 80)} for t in JOB["targets"]]
    kinds = set(PATHS.values())
    plan_text = PLAN_AI if kinds == {"redraw"} else PLAN_EXACT if kinds == {"paste"} else PLAN_BOTH
    named = str(JOB.get("title") or "").strip()
    focus = (f"The jeweller sells this piece as: '{named}'. product_box must frame exactly that piece — not figurines, "
             "boxes, stands, other jewellery or people around it. ") if named else ""
    request = (focus + plan_text + " Style: " + str(JOB.get("style") or "premium jewellery advertising") + ". Shots: " +
               json.dumps(brief, ensure_ascii=False))
    # Room for the answer only: ~110 tokens per paste shot, ~190 per redraw shot.
    budget = 160 + sum(190 if p == "redraw" else 110 for p in PATHS.values())
    plans = {int(t["index"]): fallback_plan(t) for t in JOB["targets"]}
    report.send("imageAnalysis", 10, "Studying the product photo", force=True)
    global PRODUCT_BOX, METAL, COLOURS, WEARER, PRODUCT_NAME, PIECES, VIEW
    by_index = {int(t["index"]): t for t in JOB["targets"]}
    for attempt in range(2):
        try:
            result = parse_json(ask_vlm([source_path], request, max_new_tokens=budget))
            PRODUCT_BOX = parse_box(result.get("product_box")) or PRODUCT_BOX
            seen = words(result.get("metal"), 4).lower().strip("<>")
            METAL = KNOWN_METAL or seen or METAL
            named = title_metal()
            if not KNOWN_METAL and named and METAL and bool(WHITE_METAL.search(named)) != bool(WHITE_METAL.search(METAL)):
                # The jeweller knows the metal: an antique gold read as "silver" made the model shot silver, and every
                # correct gold take was capped as "turned into gold".
                print(f"metal: the title says {named}, the analyst saw {METAL} — using {named}", flush=True)
                METAL = named
            COLOURS = words(result.get("colours"), 10).strip("<>") or COLOURS
            seen_wearer = str(result.get("wearer") or "").lower().strip("<> ")
            if not JOB.get("wearer") and seen_wearer in ("male", "female") and not is_couple():
                WEARER = seen_wearer
            PRODUCT_NAME = words(result.get("product"), 6).strip("<>").lower() or PRODUCT_NAME
            try:
                PIECES = max(1, min(12, int(float(result.get("pieces")))))
            except (TypeError, ValueError):
                pass
            seen_view = str(result.get("view") or "").lower().strip("<> ")
            VIEW = seen_view if seen_view in ("flat", "angled") else VIEW
            print("Product:", result.get("product"), "| metal:", METAL, f"(analyst saw: {seen or '-'})",
                  "| colours:", COLOURS, "| wearer:", WEARER or "any", f"(analyst: {seen_wearer or '-'})",
                  "| view:", VIEW or "-", "| box:", PRODUCT_BOX, flush=True)
            got = 0
            for shot in result.get("shots", []):
                idx = int(shot.get("index", -1))
                if idx not in by_index:
                    continue
                if PATHS[idx] == "redraw":
                    ai_prompt = words(shot.get("ai_prompt"), 120)
                    if len(ai_prompt) >= 40 and "<" not in ai_prompt:
                        plans[idx]["ai_prompt"] = ai_prompt
                        got += 1
                else:
                    scene = words(shot.get("scene"), 50)
                    if len(scene) >= 20 and "<" not in scene:
                        plans[idx]["scene_prompt"] = scene
                    plans[idx]["placement"] = placement_for(by_index[idx]["kind"], shot.get("placement"))
                    got += 1
            if got == len(plans) and PRODUCT_BOX:
                break
            print(f"Analyst planned {got}/{len(plans)} shots (box: {bool(PRODUCT_BOX)}), retrying", flush=True)
        except Exception:
            traceback.print_exc()
        request += " Return strictly valid JSON, no commentary."
    for idx, target in by_index.items():  # who may be in each shot, made certain whatever the analyst wrote
        plan, fallback = plans[idx], fallback_plan(target)
        if shot_people(target) == "none":  # display props that suit the piece (a bust only holds neck pieces)
            for key in ("ai_prompt", "scene_prompt"):
                if plan.get(key):
                    plan[key] = with_display(plan[key])
        if shot_people(target) == "none":
            for key in ("ai_prompt", "scene_prompt"):
                if plan.get(key) and BODY.search(plan[key]):
                    print(f"shot {idx}: the analyst put a person in a product-only shot; using the shot direction",
                          flush=True)
                    plan[key] = fallback.get(key, plan[key])
                    if BODY.search(plan[key]):  # the direction itself shows a person: the piece on its display
                        print(f"shot {idx}: the shot direction shows a person; the piece on its display instead",
                              flush=True)
                        plan[key] = display_scene() + (
                            ". Keep the exact jewellery from image 1 identical: same design, stones, metal colour and "
                            "proportions. Photorealistic advertising photograph." if key == "ai_prompt" else "")
        elif WEARER and plan.get("ai_prompt") and OTHER_GENDER[WEARER].search(plan["ai_prompt"]):
            print(f"shot {idx}: the analyst wrote the wrong gender for a {WEARER} piece; using the shot direction",
                  flush=True)
            plan["ai_prompt"] = fallback["ai_prompt"]
        for key in ("ai_prompt", "scene_prompt"):
            if plan.get(key):
                plan[key] = with_wearer(plan[key])
        if shot_staging(target) in ("held", "presented") and plan.get("ai_prompt") and WEARING_WORDS.search(
                plan["ai_prompt"]):
            print(f"shot {idx}: the analyst wrote the {shot_staging(target)} piece as worn; using the shot direction",
                  flush=True)
            plan["ai_prompt"] = fallback["ai_prompt"]
        held = wear_placement()
        if shot_staging(target) == "worn" and held and held[0] == "held":
            for key in ("ai_prompt", "scene_prompt"):
                if plan.get(key):
                    plan[key] = held_text(plan[key])
        if PATHS[idx] == "paste" and VIEW == "flat" and plan.get("scene_prompt"):
            plan["scene_prompt"] = flat_lay(plan["scene_prompt"])
        if plan.get("ai_prompt"):
            plan["ai_prompt"] += people_rule(target)
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
finally:
    SEG["box_ready"].set()
`;

const CELL_CUTOUT = `
# The real product, cut out at the photo's own resolution: pasted unchanged in paste shots, and the source of truth
# that restore_product() puts back on top of every redraw.
PRODUCT = None  # RGBA PIL cut-out (edge colours cleaned), or the whole photo feathered when it cannot be separated
PRODUCT_MODE = None  # "cutout" | "frame"
PRODUCT_RGB = PRODUCT_ALPHA = PRODUCT_FEATS = None  # numpy arrays + SIFT features for restore_product()
REFERENCE_PATH = None  # what klein works from in redraw shots: the clean cut-out on a soft neutral backdrop
CUT_SIDES = []  # edges of the product photo the piece runs off ("bottom" for a long chain photographed in part)


def cut_sides(solid):
    """Edges of the photo the piece runs off (a long chain photographed in part). Pasted whole into a scene, its cut
    ends looked like a broken chain; paste shots let it run off the same edge of the frame instead. A piece cut on
    three or four sides is a tight crop of something bigger: nothing to anchor."""
    h, w = solid.shape
    band = max(3, int(min(h, w) * 0.004))
    touch = {}
    for side, strip in (("top", solid[:band]), ("bottom", solid[-band:]), ("left", solid[:, :band]),
                        ("right", solid[:, -band:])):
        across = strip.any(axis=0) if side in ("top", "bottom") else strip.any(axis=1)
        if int(across.sum()) >= max(8, 0.006 * len(across)):
            touch[side] = across.mean()
    # A strand only grazing another edge (the chain's side running along it) touches far less of it than the cut.
    sides = [side for side, share in touch.items() if share >= 0.5 * max(touch.values())]
    return sides if len(sides) <= 2 else []


def feathered_frame(image):
    w, h = image.size
    edge = max(4, int(min(w, h) * 0.04))
    alpha = Image.new("L", (w, h), 0)
    ImageDraw.Draw(alpha).rectangle([edge, edge, w - edge, h - edge], fill=255)
    rgba = image.convert("RGBA")
    rgba.putalpha(alpha.filter(ImageFilter.GaussianBlur(edge / 2)))
    return rgba


def select_product(mask):
    """The parts of the mask inside the analyst's jewellery box (hands, cloth and props around it dropped). The opening
    of a kada or ring is never filled: only specks under 0.2% of the piece are removed."""
    if PRODUCT_BOX:
        x1, y1, x2, y2 = padded_box(PRODUCT_BOX, 0.05)
        boxed = np.zeros_like(mask)
        boxed[y1:y2, x1:x2] = mask[y1:y2, x1:x2]
        # Everything outside the box goes (a hand, a bust, cloth) — unless the box is clearly wrong (nearly empty).
        if (boxed > 0.5).sum() >= max(400, 0.02 * (x2 - x1) * (y2 - y1)):
            mask = boxed
    solid = (mask > 0.5).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(solid, 8)
    if n > 2:
        total = stats[1:, cv2.CC_STAT_AREA].sum()
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] < 0.002 * total:
                mask[labels == i] = 0
    return mask


try:
    if JOB["type"] != "logo":
        report.send("imageCutout", 16, "Cutting out the jewellery (BiRefNet_HR, 2048 px)", force=True)
        if not SEG["done"].is_set() and GPU_COUNT < 2:
            prepare_gpu0(False)  # one GPU: the analyst is done, segment now
        SEG["done"].wait(900)
        try:
            if SEG["mask"] is None:
                raise RuntimeError(SEG["error"] or "segmentation did not finish")
            mask = select_product(SEG["mask"].copy())
            solid = mask > 0.5
            coverage = float(solid.mean())
            print(f"Product mask covers {coverage * 100:.1f}% of the photo", flush=True)
            if not 0.0008 < coverage < 0.9:
                raise ValueError(f"mask coverage {coverage:.3f} out of range")
            kind = wear_placement()
            small = kind and kind[0] in ("finger", "toe", "ear", "nose", "forehead", "hair", "held")
            if small and not PRODUCT_BOX and coverage > 0.3:
                # A nose pin on a face, a ring on a hand: without the analyst's box BiRefNet keeps the face or hand.
                raise ValueError(f"the cut-out covers {coverage:.0%} of the photo — the person, not the small piece")
            CUT_SIDES = cut_sides(solid)
            if CUT_SIDES:
                print(f"The piece runs off the photo's {' and '.join(CUT_SIDES)} edge: paste shots keep it running off "
                      "the frame there", flush=True)
            ys, xs = np.where(solid)
            pad = int(max(source.size) * 0.015)
            box = (int(max(0, xs.min() - pad)), int(max(0, ys.min() - pad)),
                   int(min(source.width, xs.max() + pad + 1)), int(min(source.height, ys.max() + pad + 1)))
            crop = np.asarray(source.crop(box))
            PRODUCT_ALPHA = np.ascontiguousarray(mask[box[1]:box[3], box[0]:box[2]], dtype=np.float32)
            PRODUCT_RGB = refine_foreground(crop, PRODUCT_ALPHA)  # no halo of the old background on soft edges
            PRODUCT = Image.fromarray(PRODUCT_RGB).convert("RGBA")
            PRODUCT.putalpha(Image.fromarray((PRODUCT_ALPHA * 255 + 0.5).astype(np.uint8)))
            PRODUCT_FEATS = product_features(crop, PRODUCT_ALPHA)
            PRODUCT_MODE = "cutout"
            print(f"Product cut-out {crop.shape[1]}x{crop.shape[0]} px, {len(PRODUCT_FEATS['pts'])} features",
                  flush=True)
        except Exception as exc:
            print("Cut-out not usable, keeping the product photo:", exc, flush=True)
            PRODUCT = feathered_frame(source.crop(padded_box(PRODUCT_BOX)) if PRODUCT_BOX else source)
            PRODUCT_MODE = "frame"
        if PRODUCT_MODE == "cutout":
            pad = int(max(PRODUCT.size) * 0.1)
            backdrop = Image.new("RGB", (PRODUCT.width + 2 * pad, PRODUCT.height + 2 * pad), (236, 234, 230))
            backdrop.paste(PRODUCT, (pad, pad), PRODUCT)
            reference = backdrop
        else:
            reference = source.crop(padded_box(PRODUCT_BOX, 0.12)) if PRODUCT_BOX else source
        REFERENCE_PATH = os.path.join(OUT_DIR, "reference.png")
        reference.save(REFERENCE_PATH)
        report.send("imageCutout", 19, "Jewellery cut out" if PRODUCT_MODE == "cutout" else "Using the full photo",
                    force=True)
except Exception as exc:
    traceback.print_exc()
    report.send("failed", 15, f"Product cut-out failed: {type(exc).__name__}: {exc}", status="failed", force=True)
    raise
`;

const CELL_ENGINE = `
# One model load or GPU call at a time in this process. The cut-out thread (BiRefNet, GPU 0) and the analyst / judge
# (Qwen3-VL 4-bit, GPU 1) overlapping broke both in warm sessions: a model built while the other loads gets meta
# tensors (from_pretrained's empty-weights init is process-wide), and a cache flush or BiRefNet pass during a 4-bit
# generate hit "CUDA error: an illegal memory access" — after which every GPU call of the process fails.
GPU_LOCK = threading.RLock()

# FLUX.2 [klein] 9B (fp8 weights, fp16 compute) in ComfyUI on GPU 0 paints every shot (Qwen-Image only runs in
# bf16/fp32 there, which the T4 cannot do).
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
HF_TOKEN = JOB.get("hfToken") or ""  # FLUX.2 [klein] 9B is gated (checked in the setup cell)
KLEIN_NAME = "FLUX.2 [klein] 9B"
KLEIN = {
    "unet": ("models/diffusion_models", MODELS["kleinDiffusion"]),
    "clip": ("models/text_encoders", MODELS["kleinTextEncoder"]),
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


def install_comfy_requirements():
    """ComfyUI's own packages, installed while the weights download (a warm session does it at boot)."""
    try:
        if WORKER.get("comfy_requirements"):
            return
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", f"{COMFY_DIR}/requirements.txt"],
                       check=True, capture_output=True)
        WORKER["comfy_requirements"] = True
    except Exception as exc:
        traceback.print_exc()
        COMFY_STATE["error"] = f"ComfyUI install failed: {type(exc).__name__}: {exc}"


def prefetch_engine():
    """Background: clone ComfyUI, then install its packages and download the klein weights at the same time. Each
    file downloads to <name>.part on the local disk and is renamed into place only when complete."""
    try:
        if not os.path.isdir(COMFY_DIR):
            subprocess.run(["git", "clone", "--depth", "1", "https://github.com/comfyanonymous/ComfyUI.git",
                            COMFY_DIR], check=True, capture_output=True)
        installer = None
        if not WORKER.get("comfy_requirements") and "comfy_requirements" not in WORKER.get("boot", {}):
            installer = threading.Thread(target=install_comfy_requirements, daemon=True)
            installer.start()
        for (folder, url), label in zip(KLEIN.values(), [KLEIN_NAME, "its text encoder", "its VAE"]):
            fetch(url, os.path.join(COMFY_DIR, folder, url.split("/")[-1]), label)
        if installer:
            installer.join()
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


COMFY_LOCK = threading.Lock()


def ensure_comfy():
    with COMFY_LOCK:  # the GPU-0 preparation thread and the main thread may both ask
        if COMFY_STATE["info"] is None:
            _start_engine()


def _start_engine():
    if PREFETCH.is_alive():
        report.send("imageSetup", 20, f"Finishing the {KLEIN_NAME} download", force=True)
        PREFETCH.join()
    wait_boot("comfy_requirements", f"Finishing the {KLEIN_NAME} engine install", 20)
    wait_boot("klein", f"Copying {KLEIN_NAME} to the local disk", 20)
    if COMFY_STATE["error"]:
        raise RuntimeError(COMFY_STATE["error"])
    if not WORKER.get("comfy_requirements"):  # the session's boot install failed: do it now
        install_comfy_requirements()
        if COMFY_STATE["error"]:
            raise RuntimeError(COMFY_STATE["error"])
    report.send("imageSetup", 21, f"Starting the {KLEIN_NAME} image engine", force=True)
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
        if COMFY_STATE["proc"] is not None and COMFY_STATE["proc"].poll() is not None:
            raise ConnectionError("ComfyUI stopped while painting: " + open("/tmp/comfyui-image.log").read()[-800:])
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
                    try:  # a warm session paints for hours: never let the PNGs pile up on the disk
                        os.remove(os.path.join(COMFY_DIR, img.get("type", "output"), img.get("subfolder", ""),
                                               img["filename"]))
                    except OSError:
                        pass
                    return Image.open(io.BytesIO(data.content)).convert("RGB")
        time.sleep(0.5)
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
    """Run klein; a blank (fp16 overflow) result restarts ComfyUI once with an fp32 text encoder, and a crashed
    ComfyUI is restarted once and the same render tried again."""
    ensure_comfy()
    restarted = False
    for attempt in range(2):
        while True:
            try:
                names = {"reference": upload(reference, "reference.png") if reference is not None else None,
                         "canvas": upload(canvas, "canvas.png") if canvas is not None else None,
                         "mask": upload(mask.convert("RGB"), "mask.png") if mask is not None else None}
                image = run_comfy(klein_workflow(prompt, seed, width, height, **names))
                break
            except (requests.ConnectionError, ConnectionError) as exc:
                if restarted:
                    raise
                restarted = True
                print("ComfyUI crashed, restarting it:", exc, flush=True)
                with COMFY_LOCK:
                    start_comfy()
        if not blank(image):
            return image
        if attempt == 0 and not COMFY_STATE["fp32_text"]:
            print("Blank FLUX.2 output: restarting ComfyUI with an fp32 text encoder", flush=True)
            COMFY_STATE["fp32_text"] = True
            start_comfy()
    raise RuntimeError("FLUX.2 [klein] produced a blank image")


def snap16(value):
    return max(512, int(round(int(value) / 16)) * 16)


SEG = {"done": threading.Event(), "box_ready": threading.Event(), "mask": None, "error": None}


def letterbox(image, side):
    """Square network input with the aspect kept (edge-replicated border), and where the picture sits inside it."""
    w, h = image.size
    s = side / max(w, h)
    nw, nh = max(32, int(round(w * s))), max(32, int(round(h * s)))
    arr = np.asarray(image.resize((nw, nh), Image.Resampling.LANCZOS))
    top, left = (side - nh) // 2, (side - nw) // 2
    arr = np.pad(arr, ((top, side - nh - top), (left, side - nw - left), (0, 0)), mode="edge")
    return Image.fromarray(arr), (left, top, nw, nh)


def load_segmenter(auto_cls):
    """BiRefNet_HR on GPU 0. Some transformers builds create the remote-code model on the meta device and leave a few
    of its tensors there ("Cannot copy out of meta tensor" on .to()); then it is built again with real CPU tensors."""
    def on_gpu(model):
        return model.to(GEN_DEVICE).eval().half()
    try:
        return on_gpu(auto_cls.from_pretrained(MODELS["segmenter"], trust_remote_code=True))
    except NotImplementedError as exc:
        if "meta" not in str(exc):
            raise
        print("BiRefNet_HR loaded with meta tensors; loading it again without lazy init:", exc, flush=True)
        gc.collect()
        torch.cuda.empty_cache()
        return on_gpu(auto_cls.from_pretrained(MODELS["segmenter"], trust_remote_code=True, low_cpu_mem_usage=False,
                                               device_map=None))


def segment_full(image, sides=(2048, 1536, 1024)):
    """BiRefNet_HR over the whole product photo at 2048 px (1536 / 1024 if GPU memory runs out), aspect kept: a soft
    0-1 mask at the photo's own size. Runs on GPU 0 before klein loads; never beside another model load or GPU call
    of this process (GPU_LOCK)."""
    with GPU_LOCK, torch.cuda.device(GEN_DEVICE):
        return _segment_full(image, sides)


def _segment_full(image, sides):
    from torchvision import transforms
    from transformers import AutoModelForImageSegmentation
    if COMFY_STATE["info"] is not None:  # warm session: klein holds GPU 0 — ComfyUI lets go of it for a moment
        try:
            requests.post(f"{COMFY}/free", json={"unload_models": True, "free_memory": True}, timeout=60)
            time.sleep(2)
        except requests.RequestException:
            pass
    model = load_segmenter(AutoModelForImageSegmentation)
    normalise = transforms.Compose([transforms.ToTensor(),
                                    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    try:
        for side in sides:
            try:
                boxed, (left, top, nw, nh) = letterbox(image, side)
                batch = normalise(boxed).unsqueeze(0).to(GEN_DEVICE).half()
                with torch.inference_mode():
                    pred = model(batch)[-1].sigmoid().float().cpu()[0, 0].numpy()
                del batch
                pred = np.ascontiguousarray(pred[top:top + nh, left:left + nw])
                print(f"BiRefNet_HR cut-out mask at {side} px", flush=True)
                return np.clip(cv2.resize(pred, image.size, interpolation=cv2.INTER_CUBIC), 0, 1)
            except torch.cuda.OutOfMemoryError:
                print(f"Segmentation at {side} px ran out of GPU memory; trying smaller", flush=True)
                gc.collect()
                torch.cuda.empty_cache()
        raise RuntimeError("BiRefNet_HR ran out of GPU memory even at 1024 px")
    finally:
        del model
        gc.collect()
        torch.cuda.empty_cache()


def warm_up_klein():
    """A tiny 4-step render that loads klein onto GPU 0 while the analyst is still busy on GPU 1."""
    ensure_comfy()
    started = time.time()
    run_comfy(klein_workflow("a plain soft studio backdrop", 1, 256, 256), timeout=900)
    print(f"FLUX.2 [klein] warmed up in {time.time() - started:.0f}s", flush=True)


def segment_box(mask):
    """Second, closer pass when the piece is small in the photo (a ring in a hand, a necklace on a bust): BiRefNet_HR
    on the analyst's box alone segments the jewellery, not the hand or bust around it."""
    box = globals().get("PRODUCT_BOX")
    if not box:
        return mask
    x1, y1, x2, y2 = padded_box(box, 0.08)
    if (x2 - x1) * (y2 - y1) > 0.5 * source.width * source.height:
        return mask
    crop = source.crop((x1, y1, x2, y2))
    long_side = max(crop.size)
    sides = [s for s in (2048, 1536, 1024) if s <= max(1024, 2 * long_side)] or [1024]
    closer = np.zeros_like(mask)
    closer[y1:y2, x1:x2] = segment_full(crop, sides)
    print(f"Second cut-out pass on the {crop.width}x{crop.height} px product box", flush=True)
    return closer


# Warm session: the cut-out of each recent photo (by the hash of its bytes). The scenes of a campaign are separate jobs
# on the same photo; the next one skips BiRefNet — and with it unloading and reloading klein on GPU 0.
SEG_CACHE = WORKER.setdefault("seg_cache", {})


def same_box(a, b):
    """Both missing, or overlapping by IoU >= 0.85 (the analyst reads the same photo a little differently each job)."""
    if not a or not b:
        return a == b
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return union > 0 and inter / union >= 0.85


def prepare_gpu0(warm):
    try:
        if source is not None and JOB["type"] != "logo":
            cached = SEG_CACHE.get(SOURCE_KEY) if SOURCE_KEY else None
            if cached is not None:
                print("Cut-out of this photo reused from an earlier job (no BiRefNet pass)", flush=True)
                full = cached["full"]
            else:
                full = segment_full(source)
            SEG["mask"] = full
            SEG["box_ready"].wait(900)  # the analyst's box (GPU 1) decides whether a closer pass is needed
            box = globals().get("PRODUCT_BOX")
            if cached is not None and same_box(box, cached["box"]):
                SEG["mask"] = cached["mask"]
            else:
                try:
                    SEG["mask"] = segment_box(full)
                except Exception as exc:
                    print("closer cut-out pass failed, keeping the full-photo mask:", exc, flush=True)
            if SOURCE_KEY:
                SEG_CACHE.pop(SOURCE_KEY, None)
                SEG_CACHE[SOURCE_KEY] = {"full": full, "box": box, "mask": SEG["mask"]}
                while len(SEG_CACHE) > 4:  # newest last; a 2048 px mask is ~16 MB
                    SEG_CACHE.pop(next(iter(SEG_CACHE)))
    except Exception as exc:
        traceback.print_exc()
        SEG["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        SEG["done"].set()
    if warm:
        try:
            warm_up_klein()
        except Exception as exc:  # the first real render starts the engine again and reports the real error
            print("klein warm-up skipped:", exc, flush=True)


# Two GPUs: GPU 0 cuts the jewellery out and loads klein while GPU 1 runs the analyst. One GPU: it all runs in turn.
if GPU_COUNT >= 2:
    threading.Thread(target=prepare_gpu0, args=(True,), daemon=True).start()
`;

const CELL_GENERATE = `
QUALITY = ("professional jewellery advertising photograph, photorealistic, shot on an 85mm lens, soft studio "
           "lighting, sharp focus, rich detail, natural skin texture, spotless clean surfaces, elegant composition")
OUT_LONG = 1920  # deliverables: long side upscaled to this, with the real product pixels restored at that size


def final_size(target):
    w, h = int(target["width"]), int(target["height"])
    s = min(2.0, OUT_LONG / max(w, h))
    return max(w, int(round(w * s / 2)) * 2), max(h, int(round(h * s / 2)) * 2)


def layout(width, height, place):
    """The product layer (RGBA, frame-sized, straight from the source-resolution cut-out) and the inpaint mask
    (white = paint, black = keep the product)."""
    product = PRODUCT
    if PRODUCT_MODE == "frame":
        place = {"x": 0.5, "y": 0.5, "scale": 0.86}
    target_w = width * place["scale"]
    target_h = target_w * product.height / product.width
    if target_h > height * 0.8:
        target_h = height * 0.8
        target_w = target_h * product.width / product.height
    return _place(product, width, height, place, target_w, target_h)


def _place(product, width, height, place, target_w, target_h):
    size = (max(8, int(target_w)), max(8, int(target_h)))
    scaled = product.resize(size, Image.Resampling.LANCZOS)
    cx = min(max(place["x"] * width, size[0] / 2), width - size[0] / 2)
    cy = min(max(place["y"] * height, size[1] / 2), height - size[1] / 2)
    anchor = place.get("anchor") or ()  # a piece cut by its photo's edge runs off the same edge of the frame
    if ("bottom" in anchor) != ("top" in anchor):
        cy = height - size[1] / 2 if "bottom" in anchor else size[1] / 2
    if ("right" in anchor) != ("left" in anchor):
        cx = width - size[0] / 2 if "right" in anchor else size[0] / 2
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    layer.paste(scaled, (int(cx - size[0] / 2), int(cy - size[1] / 2)))
    alpha = layer.getchannel("A")
    keep = alpha.point(lambda v: 255 if v > 90 else 0).filter(ImageFilter.MaxFilter(5))
    paint = keep.point(lambda v: 255 - v)
    return layer, paint


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


def judge_reference():
    """The product photo as the judge sees it: at most 1024 px (a full-size phone photo is thousands of image tokens).
    Named per job: a warm session shares OUT_DIR, and a cached reference of the last job judged the next one against
    the wrong product."""
    path = os.path.join(OUT_DIR, f"judge-reference-{JOB.get('jobId') or id(JOB)}.jpg")
    if not os.path.exists(path):
        save_view(Image.open(REFERENCE_PATH or source_path).convert("RGB"), path)
    return path


def save_view(image, path, long_side=1024, box=None):
    """A smaller copy (or a close-up of box) for the judge: fewer image tokens, same detail where it matters."""
    view = image.crop(box) if box else image.copy()
    view.thumbnail((long_side, long_side), Image.Resampling.LANCZOS)
    view.save(path, quality=95, subsampling=0)
    return path


JUDGE_ANSWER = ('Answer with JSON only: {"score": <0-10>, "metal": "<metal colour of the jewellery in image 2>", '
                '"worn": <true, false or null>, "extra_jewellery": <true or false>, "pieces": <number>, '
                '"people": "<none, man, woman or both>", "worn_on": "<finger, wrist, upper arm, neck, ear, ankle, toe, '
                'nose, forehead, hair, hand, waist, held or none>", "piece_box": [<x1>, <y1>, <x2>, <y2>], '
                '"issues": "<what is wrong, short>", "fix": "<one sentence describing how the photo should look '
                'instead, in positive words>"}')


def ask_judge(images, text):
    for attempt in range(2):
        try:
            # Room for every field: the answer often comes pretty-printed, and 260 tokens cut it off mid "issues".
            return parse_json(ask_vlm(images, text, max_new_tokens=480))
        except Exception:
            traceback.print_exc()
    return None


def judge(candidate, target, plan, info, idx, attempt):
    """Qwen3-VL on GPU 1 scores a take 0-10, names what is wrong and how it should look instead. Hard limits that its
    overall number cannot override: a changed metal colour (measured in CIELAB when the piece was located, or read
    by the judge), extra jewellery, a worn piece that is held or floating, and a piece that no longer matches the photo.
    Returns (score, issues, fix) or None without a judge."""
    if not JUDGE:
        return None
    # A campaign's model scene is a worn shot too: its piece is drawn on the body, never pasted (no photo match cap).
    staging = shot_staging(target)
    worn = staging == "worn"
    images = [judge_reference(), save_view(candidate, os.path.join(OUT_DIR, f"judge-{idx}-{attempt}.jpg"))]
    closeup = ""
    if info.get("box"):
        x1, y1, x2, y2 = info["box"]
        px, py = int((x2 - x1) * 0.4) + 16, int((y2 - y1) * 0.4) + 16  # room around it: a tight crop read as "cut off"
        box = (max(0, x1 - px), max(0, y1 - py), min(candidate.width, x2 + px), min(candidate.height, y2 + py))
        images.append(save_view(candidate, os.path.join(OUT_DIR, f"judge-{idx}-{attempt}-closeup.jpg"), 768, box))
        closeup = "Image 3 is a close-up of the jewellery in image 2 (only to show its detail; its edges are not the photo's). "
    text = ("Image 1 is the real jewellery product. Image 2 is a generated advertising photo that must show exactly "
            "that product. " + closeup + "Shot direction: " + words(plan["scene_prompt"], 60) + ". Score image 2 "
            "from 0 to 10 as a premium jewellery advert, strictly: the product appears exactly once and no extra or "
            "duplicate jewellery was added; it sits naturally at a believable real-life size (worn, held or resting "
            "correctly, edges blend in, no halo or cut-out look, its lighting and shadow match the scene); faces, "
            "hands and fingers look anatomically correct; the photo looks like a real high-end camera shot (no plastic "
            "skin, smearing, warped background, dust, lint or stray fibres on the surface, or AI artefacts); the scene "
            "matches the direction; no text or watermark. A 9 or 10 must be publishable as is. Compare the jewellery closely with image 1 — design, "
            "motifs, stones, stone count, enamel colours, metal colour and proportions must match; any visible change "
            "scores at most 4. worn = true only if a person physically wears it on the body (around the wrist, on the "
            "neck, in the ear, on the finger), touching the skin; false if it is held, floating or beside the body; "
            "null if no person is in the photo. people = none if no person and no body part (no hand, finger, wrist, "
            "face) is visible anywhere in image 2, otherwise man or woman for the person you see. worn_on = where on "
            "the body the jewellery from image 1 is worn in image 2 (held = in a hand, none = no person). pieces = how "
            "many separate jewellery items of the kind in image 1 you can see in image 2 — count each ring, earring, "
            "bangle, anklet, chain or pendant separately, also smaller or differently angled ones (0 if none). "
            "piece_box = a tight box around ONLY the jewellery in image 2 (not the "
            "hand or finger) as [x1, y1, x2, y2] in 0-1000 coordinates of image 2's width and height. " + JUDGE_ANSWER)
    result = ask_judge(images, text)
    if result is None:
        return 5.0, "the judge could not score this take", ""
    # Where the piece sits in this take: a redrawn take without the real product restored still gets a mask from it,
    # so the video holds this drawn piece steady instead of letting it melt from frame to frame.
    info["drawn_box"] = box_in(result.get("piece_box"), candidate.size)
    score = clamp(result.get("score"), 0, 10, 5.0)
    info["raw_score"] = score
    caps = []  # which hard limits capped this take: a take capped only for a copy is cleaned instead of repainted
    info["caps"] = caps
    issues = [str(result.get("issues", ""))[:200]]
    fix = str(result.get("fix", ""))[:240]
    seen = str(result.get("metal", "")).lower()
    if info.get("metal_changed"):
        score = min(score, 2.0)
        caps.append("metal")
        issues.insert(0, "the metal colour changed from the photo (measured)")
    elif (info.get("coverage", 1.0 if info.get("path") == "paste" else 0.0) < 0.92 and METAL
          and WHITE_METAL.search(METAL) and "gold" in seen and "white gold" not in seen):
        score = min(score, 2.0)
        caps.append("metal")
        issues.insert(0, f"the {METAL} jewellery was turned into {seen}")
        fix = f"The jewellery is {METAL}: cool white-grey metal exactly as in the product photo. " + fix
    elif (info.get("coverage", 1.0 if info.get("path") == "paste" else 0.0) < 0.92 and METAL and OXIDISED.search(METAL)
          and seen and not DARK_SEEN.search(seen)):
        score = min(score, 5.0)
        caps.append("metal")
        issues.insert(0, f"the {METAL} piece came out {seen}: its dark blackened finish is gone")
        fix = f"The jewellery keeps its dark, blackened {METAL} finish exactly as in the product photo. " + fix
    if result.get("extra_jewellery") is True:
        score = min(score, 3.0)
        caps.append("extra")
        issues.insert(0, "extra jewellery was added")
    # Pieces of this kind against the product photo's own count: a pair of payals stays a pair, a ring is one.
    try:
        seen_pieces = int(float(result.get("pieces")))
    except (TypeError, ValueError):
        seen_pieces = None
    expected = PIECES or 1
    if info.get("path") == "paste" and not info.get("cleaned") and not info.get("duplicate"):
        # The judge often misses a plainer second ring klein painted beside the real one (toe rings on a thali): the
        # copy finder looks at every paste take too, and what it finds is painted out by the next take.
        copies = copy_boxes(images[1], info, candidate.size)
        if copies:
            info["duplicate"], info["copies"] = True, copies
            print(f"copy finder: {len(copies)} more cop{'y' if len(copies) == 1 else 'ies'} of the piece in the take",
                  flush=True)
    if seen_pieces == 0:
        score = min(score, 2.0)
        caps.append("missing")
        issues.insert(0, "the product is missing from the photo")
    elif seen_pieces is not None and seen_pieces > expected and not info.get("duplicate"):
        info["duplicate"] = True
        issues.insert(0, f"the piece appears {seen_pieces} times (the photo shows {expected})")
    if info.get("duplicate"):
        score = min(score, 3.0)
        caps.append("duplicate")
        if not any("appears" in i and "times" in i for i in issues):
            issues.insert(0, "the piece appears twice (measured)")
        fix = ("The jewellery appears exactly once in the photo, no second copy anywhere. " if expected == 1 else
               f"Exactly the {expected} pieces of the product photo, no extra copy anywhere. ") + fix
    # Who is in the photo: product-only shots have nobody, the model shot has the piece's own wearer.
    seen_people = str(result.get("people", "")).lower().strip("<> ")
    if shot_people(target) == "none" and seen_people in ("man", "woman", "person", "yes", "both"):
        score = min(score, 3.0)
        caps.append("people")
        issues.insert(0, "a person or hand appears in a product-only shot")
        fix = ("The jewellery alone on its surface as a product close-up, with no person, hand or fingers anywhere in "
               "the photo. " + fix)
    elif staging in ("worn", "presented") and WEARER and not is_couple() and seen_people in ("man", "woman"):
        want = "man" if WEARER == "male" else "woman"
        if seen_people != want:
            score = min(score, 3.0)
            caps.append("people")
            issues.insert(0, f"the model must be a {want} for this {WEARER} piece")
            fix = f"Worn by {ADULT[WEARER]}. " + fix
    placement = wear_placement() if staging == "worn" else None
    worn_on = str(result.get("worn_on", "")).lower().strip("<> ")
    accepted = WORN_ON_OK.get(placement[0], set()) | {placement[0]} if placement else set()
    misplaced = bool(placement and worn_on and worn_on != "none" and worn_on not in accepted
                     and not worn_on.startswith(placement[0]))
    if misplaced and worn_on in CONFUSABLE.get(placement[0], ()):
        # The long scoring question misreads unusual places (an armlet high on the arm read as "wrist", a matha patti
        # set with a waist piece read as "waist"): one short yes / no question decides. Only for such near misses — a
        # nose ring drawn as a necklace ("neck") was "confirmed" by it once.
        name = PRODUCT_NAME or "jewellery"
        check = confirm(images[1], f"Is the {name} in this photo worn {placement[1].split(' (')[0]}?")
        if check is True:
            print(f"placement confirmed on a second look ({worn_on} was a misreading)", flush=True)
            misplaced = False
    if misplaced:
        score = min(score, 3.0)
        caps.append("placement")
        issues.insert(0, f"the {PRODUCT_NAME or 'piece'} is worn on the {worn_on}, not {placement[1].split(',')[0]}")
        verb = "holds it" if placement[0] == "held" else "wears it"
        fix = f"The model {verb} {placement[1]}; {placement[2]}. " + fix
    if staging in ("held", "presented") and result.get("worn") is True:
        score = min(score, 3.0)
        caps.append("worn")
        where = "held between the gloved fingertips" if staging == "held" else "inside the open box"
        issues.insert(0, f"the piece is worn on the body instead of {where}")
        fix = f"Nobody wears the piece: it appears exactly once, {where}. " + fix
    if worn and result.get("worn") is False and not (placement and placement[0] == "held"):
        score = min(score, 4.0)
        caps.append("worn")
        issues.insert(0, "the jewellery is held or floating instead of being worn on the body")
    if info.get("path") == "redraw" and info.get("match_attempted") and not info.get("located") and not worn:
        score = min(score, 6.0)
        caps.append("match")
        issues.insert(0, "the drawn piece does not match the product photo closely")
    return score, "; ".join(i for i in issues if i), fix


# Body parts the judge's long question mixes up with where the piece really is (worn_on readings worth a second look).
CONFUSABLE = {"upper arm": {"wrist", "hand", "arm"}, "forehead": {"waist", "hair", "head"}, "hair": {"forehead", "head"},
              "toe": {"ankle", "foot"}, "ankle": {"toe", "foot"}, "finger": {"hand"}, "held": {"hand"},
              "wrist": {"hand", "arm"}}


def confirm(image_path, question):
    """A yes / no question about one image: True, False, or None when the judge could not answer."""
    try:
        answer = parse_json(ask_vlm([image_path], question + ' Answer with JSON only: {"answer": true} or '
                                    '{"answer": false}', max_new_tokens=20))
        value = answer.get("answer")
        return value if isinstance(value, bool) else str(value).lower() in ("true", "yes")
    except Exception:
        return None


def prefer_second(first, second, plan):
    """Head-to-head between the two best takes when their scores are within a point."""
    text = ("Image 1 is the real jewellery product. Images 2 and 3 are two generated advertising photos of it for: " +
            words(plan["scene_prompt"], 50) + ". Which is the better finished advert — the product looks exactly like "
            "image 1 and appears once at a natural size, people and hands look real, the light is believable and it "
            'looks like a real premium photo? Answer with JSON only: {"better": 2} or {"better": 3}')
    try:
        # Three full-size photos ran the judge's GPU out of memory: 768 px views keep the comparison possible.
        views = [save_view(Image.open(p).convert("RGB"), os.path.join(OUT_DIR, f"prefer-{n}.jpg"), 768)
                 for n, p in enumerate((REFERENCE_PATH or source_path, first["path"], second["path"]))]
        answer = parse_json(ask_vlm(views, text, max_new_tokens=40))
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


PLACEHOLDER = (128, 126, 122)


def paste_shot(target, plan, seed, fix=""):
    """Paste path: klein sees the product pinned on a grey placeholder and paints only the grey; the scene is then
    upscaled and the untouched source-resolution cut-out goes on top with a contact shadow."""
    width, height = int(target["width"]), int(target["height"])
    gen_w, gen_h = snap16(width), snap16(height)
    fw, fh = final_size(target)
    place = dict(plan["placement"] or placement_for(target["kind"], None))
    if PRODUCT_MODE == "cutout":  # never enlarge the piece past 1.5x its photographed pixels: that adds blur, not detail
        place["scale"] = min(place["scale"], PRODUCT.width * 1.5 / fw)
        place["anchor"] = list(CUT_SIDES)
    small_layer, paint = layout(gen_w, gen_h, place)
    canvas = Image.new("RGBA", (gen_w, gen_h), PLACEHOLDER + (255,))
    # A soft shadow just under the piece: klein then paints the surface right beneath it. Without one a ring left in
    # mid-air got a plinth painted lower down, with a second ring of klein's own on it.
    ground = Image.new("L", (gen_w, gen_h), 0)
    ground.paste(small_layer.getchannel("A"), (0, max(3, int(gen_h * 0.01))))
    ground = ground.filter(ImageFilter.GaussianBlur(max(4, gen_w * 0.018))).point(lambda v: int(v * 0.5))
    canvas.paste((74, 72, 68, 255), None, ground)
    canvas.alpha_composite(small_layer)
    canvas = canvas.convert("RGB")
    prompt = ("Replace the plain grey placeholder around the jewellery in image 1 with a photorealistic scene: " +
              plan["scene_prompt"] + ". The jewellery stays exactly where it is, at the same size, unchanged and shown "
              "only once; no other jewellery. It rests directly on the surface right beneath it, touching it, with a "
              "soft contact shadow." + (f" It continues past the {' and '.join(CUT_SIDES)} edge of the photo, as in "
                                        "image 1." if CUT_SIDES and PRODUCT_MODE == "cutout" else "") +
              people_rule(target) + " " + QUALITY + "." + (" " + fix if fix else ""))
    scene = klein(prompt, seed, gen_w, gen_h, reference=canvas, canvas=canvas, mask=paint)
    scene = scene.resize((fw, fh), Image.Resampling.LANCZOS)
    layer, _ = layout(fw, fh, place)
    out = composite(scene, layer, target["kind"])
    alpha = np.asarray(layer.getchannel("A"), dtype=np.float32) / 255.0
    ys, xs = np.where(alpha > 0.5)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1) if len(xs) else None
    return out, plan["scene_prompt"], alpha, {"path": "paste", "located": True, "restored": True, "box": box}


def redraw_shot(target, plan, seed, fix=""):
    """Redraw path: klein draws the whole photo from the clean cut-out (worn, held, in a box), then the real
    product pixels are restored on top wherever its drawing matches the photo."""
    width, height = int(target["width"]), int(target["height"])
    prompt = fit_metal(plan.get("ai_prompt") or plan["scene_prompt"])
    if fix:
        prompt += " " + fix
    image = klein(prompt, seed, snap16(width), snap16(height), reference=Image.open(REFERENCE_PATH).convert("RGB"))
    image = ImageOps.fit(image, final_size(target), Image.Resampling.LANCZOS)
    info = {"path": "redraw", "located": False, "restored": False}
    mask = None
    if PRODUCT_FEATS is not None:
        started = time.time()
        frame = np.asarray(image)
        H, found = match_product(PRODUCT_FEATS, frame)
        info["match"] = found
        info["match_attempted"] = found.get("reason") != "too few features on the product"
        if H is not None:
            info["located"] = True
            out, m, rs = restore_product(frame, PRODUCT_RGB, PRODUCT_ALPHA, H)
            warped = cv2.warpPerspective(PRODUCT_ALPHA, H, (frame.shape[1], frame.shape[0])) > 0.5
            ys, xs = np.where(warped)
            if len(xs):
                info["box"] = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
            info["coverage"] = round(rs.get("coverage", 0.0), 3)
            if out is not None:
                image, mask, info["restored"] = Image.fromarray(out), m, True
                # A partial restore leaves part of the piece as drawn: that part must not show a different metal.
                info["metal_changed"] = metal_changed(rs.get("tone_rest_product"), rs.get("tone_rest_generated"))
            else:
                info["metal_changed"] = metal_changed(rs.get("tone_product"), rs.get("tone_generated"))
                info["why_not_restored"] = rs.get("reason")
                # Where the drawn piece is (its outline, from the match): the video holds those pixels steady.
                soft = cv2.warpPerspective(PRODUCT_ALPHA, H, (frame.shape[1], frame.shape[0]))
                info["drawn_alpha"] = (np.clip(soft, 0, 1) * 255).astype(np.uint8)
        print(f"restore: {json.dumps({k: v for k, v in info.items() if k != 'box'}, default=str)} "
              f"({time.time() - started:.1f}s)", flush=True)
    return image, prompt, mask, info


def klein_logo(target, seed):
    width, height = int(target["width"]), int(target["height"])
    prompt = ("Luxury jewellery brand backdrop: deep black velvet texture with a subtle warm gold glow, a small ornate "
              "gold emblem with a diamond motif in the upper third, wide empty dark space in the middle and lower "
              "half. Minimal premium brand identity, high contrast, ultra detailed. No text, letters or words.")
    image = klein(prompt, seed, snap16(width), snap16(height))
    if image.size != (width, height):
        image = ImageOps.fit(image, (width, height), Image.Resampling.LANCZOS)
    return typeset_name(image, JOB["title"]), prompt


def second_copy(image, info):
    """True when the piece appears a second time beside the one placed in the take (klein sometimes paints another
    copy into the scene): the real product's features matched again with the placed piece hidden."""
    if PRODUCT_FEATS is None or not info.get("box"):
        return False
    frame = np.asarray(image.convert("RGB")).copy()
    x1, y1, x2, y2 = info["box"]
    pad = int(0.12 * max(x2 - x1, y2 - y1)) + 6
    frame[max(0, y1 - pad):y2 + pad, max(0, x1 - pad):x2 + pad] = 127
    try:
        H, stats = match_product(PRODUCT_FEATS, frame)
    except Exception:
        return False
    if H is not None:
        print(f"second copy of the piece found ({stats.get('inliers')} inliers)", flush=True)
    return H is not None


def overlap(box, other):
    """Share of box's area that lies inside other."""
    w = min(box[2], other[2]) - max(box[0], other[0])
    h = min(box[3], other[3]) - max(box[1], other[1])
    area = max(1, (box[2] - box[0]) * (box[3] - box[1]))
    return max(0, w) * max(0, h) / area


def copy_boxes(image_path, info, size):
    """Pixel boxes of the extra copies klein painted beside the placed real piece of a paste take ([] when the judge
    cannot tell them apart from it)."""
    placed = info.get("box")
    if not placed:
        return []
    text = (f"List every {PRODUCT_NAME or 'jewellery piece'} you can see in this photo — each separate one, also smaller "
            "or partly hidden ones — as boxes [x1, y1, x2, y2] in 0-1000 coordinates of the image width and height. "
            'Answer with JSON only: {"boxes": [[x1, y1, x2, y2], ...]}')
    try:
        # The judge's 1024 px view (fewer image tokens on its GPU); the boxes are relative, so they map back as is.
        view = save_view(Image.open(image_path).convert("RGB"), os.path.join(OUT_DIR, "copies-view.jpg"))
        answer = parse_json(ask_vlm([view], text, max_new_tokens=200))
    except Exception:
        traceback.print_exc()
        return []
    boxes = []
    for raw in (answer.get("boxes") or [])[:6]:
        box = box_in(raw, size, max_area=0.2)
        # The placed piece itself (a loose box around it, or one that swallows it) is never painted over.
        if box and overlap(box, placed) < 0.3 and overlap(placed, box) < 0.5:
            boxes.append(box)
    return boxes


def clean_copies(target, plan, seed, clean):
    """The take with its extra copies painted out: klein repaints only their boxes (the scene continues there), and
    every other pixel — the placed real product above all — stays exactly as it was. None when nothing is left to
    paint once the product is kept out of the boxes."""
    base = Image.open(clean["path"]).convert("RGB")
    fw, fh = base.size
    hole = np.zeros((fh, fw), np.uint8)
    for x1, y1, x2, y2 in clean["boxes"]:
        px, py = int((x2 - x1) * 0.25) + 8, int((y2 - y1) * 0.25) + 8
        hole[max(0, y1 - py):y2 + py, max(0, x1 - px):x2 + px] = 255
    if clean.get("mask") is not None:
        keep = cv2.dilate((np.clip(clean["mask"], 0, 1) > 0.05).astype(np.uint8), np.ones((15, 15), np.uint8))
        hole[keep > 0] = 0
    if (hole > 0).sum() < 400:
        return None
    gen_w, gen_h = snap16(int(target["width"])), snap16(int(target["height"]))
    small = base.resize((gen_w, gen_h), Image.Resampling.LANCZOS)
    prompt = ("In the masked areas of image 1, continue its scene — " + plan["scene_prompt"] + " — showing only the "
              "surface and background there, with no jewellery in them; the rest of the photo stays exactly as it is. "
              + QUALITY + ".")
    painted = klein(prompt, seed, gen_w, gen_h, reference=small, canvas=small,
                    mask=Image.fromarray(hole).resize((gen_w, gen_h), Image.Resampling.BILINEAR))
    painted = painted.resize((fw, fh), Image.Resampling.LANCZOS)
    soft = Image.fromarray(hole).filter(ImageFilter.GaussianBlur(5))
    if clean.get("mask") is not None:  # the blur must not bleed onto the product either
        soft = Image.fromarray(np.where(keep > 0, 0, np.asarray(soft)).astype(np.uint8))
    out = Image.composite(painted, base, soft)
    info = {k: v for k, v in clean["info"].items() if k not in ("caps", "raw_score", "drawn_box", "copies")}
    info.update(cleaned=True, duplicate=False)
    info["duplicate"] = second_copy(out, info)
    print(f"painted out {len(clean['boxes'])} extra cop{'y' if len(clean['boxes']) == 1 else 'ies'} of the piece",
          flush=True)
    return out, clean["prompt"], clean["mask"], info


def make_shot(target, plan, seed, fix=""):
    """(image, prompt used, product mask or None, info) for one take."""
    image, prompt, mask, info = _make_shot(target, plan, seed, fix)
    if info.get("path") != "logo":
        info["duplicate"] = second_copy(image, info)
    return image, prompt, mask, info


def _make_shot(target, plan, seed, fix=""):
    path = PATHS.get(int(target["index"]), "paste")
    if path == "logo":
        image, prompt = klein_logo(target, seed)
        return image, prompt, None, {"path": "logo"}
    # The paste path needs a real cut-out: a photo that could not be separated (PRODUCT_MODE "frame") would be pasted
    # as a rectangle — hand, table and all — so those shots are redrawn from it instead.
    if path == "paste" and PRODUCT is not None and PRODUCT_MODE == "cutout":
        return paste_shot(target, plan, seed, fix)
    return redraw_shot(target, plan, seed, fix)


def put(url, path_or_bytes, content_type):
    """Upload with retries; a file is reopened on every attempt (a half-read stream cannot be resent)."""
    def once():
        if isinstance(path_or_bytes, (bytes, bytearray)):
            requests.put(url, data=path_or_bytes, headers={"Content-Type": content_type}, timeout=300).raise_for_status()
        else:
            with open(path_or_bytes, "rb") as fh:
                requests.put(url, data=fh, headers={"Content-Type": content_type}, timeout=300).raise_for_status()
    with_retries("upload", once, attempts=5)


def drawn_piece_mask(info, size):
    """For a redrawn take whose real product could not be restored: a soft mask over the piece as drawn — its matched
    outline when the photo was located, else the judge's box around it (with a little of the finger: it moves with the
    piece). The video then keeps these pixels of the approved still in every frame. None for other takes."""
    if info.get("path") != "redraw":
        return None
    w, h = size
    if info.get("drawn_alpha") is not None and info["drawn_alpha"].shape[:2] == (h, w):
        alpha = info["drawn_alpha"].astype(np.float32) / 255.0
        if (alpha > 0.5).sum() >= 200:
            alpha = cv2.dilate(alpha, np.ones((5, 5), np.uint8))
            return (np.clip(cv2.GaussianBlur(alpha, (0, 0), 1.5), 0, 1) * 255 + 0.5).astype(np.uint8)
    box = info.get("drawn_box")
    if not box:
        return None
    x1, y1, x2, y2 = box
    px, py = int((x2 - x1) * 0.12) + 6, int((y2 - y1) * 0.12) + 6
    x1, y1, x2, y2 = max(0, x1 - px), max(0, y1 - py), min(w, x2 + px), min(h, y2 + py)
    if (x2 - x1) * (y2 - y1) < 600:
        return None
    radius = max(2, int(min(x2 - x1, y2 - y1) * 0.2))
    inner = np.zeros((h, w), np.float32)
    cv2.rectangle(inner, (x1 + radius, y1), (x2 - radius - 1, y2 - 1), 1.0, -1)
    cv2.rectangle(inner, (x1, y1 + radius), (x2 - 1, y2 - radius - 1), 1.0, -1)
    for cx, cy in ((x1 + radius, y1 + radius), (x2 - radius - 1, y1 + radius), (x1 + radius, y2 - radius - 1),
                   (x2 - radius - 1, y2 - radius - 1)):
        cv2.circle(inner, (cx, cy), radius, 1.0, -1)
    mask = cv2.GaussianBlur(inner, (0, 0), max(1.5, radius * 0.4))
    return (np.clip(mask, 0, 1) * 255 + 0.5).astype(np.uint8)


def upload_best(target, best):
    put(target["uploadUrl"], best["path"], "image/jpeg")
    if target.get("maskUploadUrl"):
        # Where the real product sits in this still: the video notebook locks those pixels in every frame.
        # A take without a restored product uploads an empty mask, so no earlier attempt's mask survives.
        buffer = io.BytesIO()
        size = Image.open(best["path"]).size
        drawn = None if best["mask"] is not None else drawn_piece_mask(best["info"], size)
        if best["mask"] is not None:
            Image.fromarray((np.clip(best["mask"], 0, 1) * 255 + 0.5).astype(np.uint8)).save(buffer, "PNG")
        elif drawn is not None:
            Image.fromarray(drawn).save(buffer, "PNG")
        else:
            Image.new("L", size, 0).save(buffer, "PNG")
        try:
            put(target["maskUploadUrl"], buffer.getvalue(), "image/png")
        except Exception as exc:
            print("product mask upload failed (the video keeps the generated pixels):", exc, flush=True)


try:
    # Even the best model sometimes gets a hand, the scale or the metal wrong, so the judge checks the first take.
    # A second take is painted only when the first is not publishable, and it is told how the photo should look.
    # Several shots in one job are pipelined: GPU 0 paints the next shot (or a second take) while GPU 1 judges —
    # every shot still gets exactly the same takes, judging and fixes as on its own.
    import queue as _queue
    TAKES = 2 if JUDGE else 1
    GOOD_ENOUGH = 8
    report.send("imageGeneration", 20, "Preparing the FLUX.2 [klein] image engine", force=True)
    targets = list(JOB["targets"])
    total = max(1, len(targets))
    failures = []
    failure_reasons = []
    shots = [{"target": t, "idx": int(t["index"]), "plan": PLANS.get(int(t["index"])) or fallback_plan(t),
              "label": f"image {n + 1}/{total}", "takes": [], "errors": [], "share": 0.0, "done": False}
             for n, t in enumerate(targets)]

    def progress():
        return 22 + 76 * sum(s["share"] for s in shots) / total

    def step(shot, share):
        shot["share"] = max(shot["share"], share)
        return progress()

    paint_queue = _queue.PriorityQueue()  # (priority, order, shot number, attempt, fix): second takes go first
    judged = _queue.Queue()  # painted takes (or errors) for the judge, in the order they were painted
    order = iter(range(10**9))
    for n in range(len(shots)):
        paint_queue.put((1, next(order), n, 0, ""))

    def painter():
        """GPU 0: klein (in ComfyUI) + the CPU restore, one take after another."""
        while True:
            item = paint_queue.get()
            if item[2] is None:
                return
            _, _, n, attempt, fix = item
            shot = shots[n]
            clean = shot.pop("clean", None)
            note = (" · painting out the extra copy" if clean else
                    " · on its display" if shot.get("restaged_at") == attempt else
                    " · second take: " + fix[:120] if attempt else "")
            report.send("imageGeneration", step(shot, 0.05 + 0.5 * attempt), f"Painting {shot['label']}" + note,
                        force=True, imageIndex=shot["idx"])
            try:
                made = clean_copies(shot["target"], shot["plan"], random.randrange(2**31 - 1), clean) if clean else None
                image, used_prompt, mask, info = made or make_shot(shot["target"], shot["plan"],
                                                                   random.randrange(2**31 - 1), fix)
                path = os.path.join(OUT_DIR, f"image-{shot['idx']}-{attempt}.jpg")
                image.save(path, "JPEG", quality=95, subsampling=0, optimize=True)
                judged.put((n, attempt, {"image": image, "path": path, "prompt": used_prompt, "mask": mask,
                                         "info": info, "target": shot["target"], "plan": shot["plan"]}, None))
            except BaseException as exc:  # whatever happens, the judge hears about this take
                traceback.print_exc()
                try:
                    free_gpu()
                except Exception:
                    pass
                judged.put((n, attempt, None, exc))

    painter_thread = threading.Thread(target=painter, daemon=True)
    painter_thread.start()

    def finish(shot):
        """Best take uploaded (head-to-head when the two are within a point), or the shot fails."""
        shot["done"] = True
        idx, label = shot["idx"], shot["label"]
        try:
            takes = shot["takes"]
            if not takes:
                raise RuntimeError(shot["errors"][-1] if shot["errors"] else "no take was produced")
            takes.sort(key=lambda t: t["score"], reverse=True)
            if JUDGE and len(takes) > 1 and takes[0]["score"] - takes[1]["score"] <= 1 and prefer_second(
                    takes[0], takes[1], shot["plan"]):
                takes[0], takes[1] = takes[1], takes[0]
            best = takes[0]
            # A re-staged scene tells the backend how the still was staged: its clip must not ask for a model.
            staged = best.get("target") or shot["target"]
            restaged = {"scenePrompt": staged["prompt"], "motionPrompt": PRODUCT_MOTION} if staged.get("restaged") else {}
            if JUDGE:
                restored = " · real product restored" if best["info"].get("restored") else ""
                shown = " · shown on its display" if staged.get("restaged") and not is_kids() else ""
                report.send("imageReview", step(shot, 0.97), f"{label.capitalize()}: " + (
                    f"kept take {best['take']} of {len(takes)} ({best['score']:.0f}/10)" if len(takes) > 1 else
                    f"quality {best['score']:.0f}/10") + restored + shown, force=True, imageIndex=idx)
            upload_best(shot["target"], best)
            report.send("imageDone", step(shot, 1.0), f"{label.capitalize()} ready", force=True, imageIndex=idx,
                        imagePrompt=str(best["prompt"])[:4000], qualityScore=best["score"], **restaged)
        except Exception as exc:
            traceback.print_exc()
            failures.append(idx)
            failure_reasons.append(f"{idx}: {type(exc).__name__}: {str(exc)[:300]}")
            try:
                free_gpu()
            except Exception:
                pass
            report.send("imageFailed", step(shot, 1.0), f"Image {idx} failed: {type(exc).__name__}: {exc}",
                        force=True, imageIndex=idx)

    def can_restage(shot):
        """A campaign's model scene none of whose takes kept the real design (or its place on the body): a model
        wearing a different piece is no advert for the jeweller's own, so the scene shows the real cut-out on its
        display instead."""
        return (JUDGE and JOB["type"] == "campaign" and MODE == "exact" and PRODUCT is not None
                and PRODUCT_MODE == "cutout" and shot_people(shot["target"]) == "model"
                and not shot["target"].get("restaged") and max(t["score"] for t in shot["takes"]) <= 4)

    def restage(shot, attempt):
        target = dict(shot["target"], prompt=display_scene(), restaged=True)
        plan = fallback_plan(target)
        if VIEW == "flat":
            plan["scene_prompt"] = flat_lay(plan["scene_prompt"])
        shot["target"], shot["plan"], shot["restaged_at"] = target, plan, attempt
        PATHS[shot["idx"]] = "paste"
        print(f"{shot['label']}: no model take kept the real piece — shown on its display instead: "
              f"{plan['scene_prompt']}", flush=True)

    try:
        while not all(s["done"] for s in shots):  # GPU 1: the judge, in the order takes were painted
            try:
                n, attempt, take, error = judged.get(timeout=30)
            except _queue.Empty:
                if painter_thread.is_alive():
                    continue
                raise RuntimeError("the painting thread stopped")  # never wait forever for a take
            shot = shots[n]
            if error is not None:
                shot["errors"].append(f"{type(error).__name__}: {error}")
                if COMFY_STATE["info"] is None:  # the image engine never started: every take fails the same way
                    for other in shots:
                        if not other["done"]:
                            other["errors"].append(f"{type(error).__name__}: {error}")
                            finish(other)
                    raise error
                if attempt + 1 < TAKES:  # as before: an error is skipped and the next take tried
                    paint_queue.put((0, next(order), n, attempt + 1, ""))
                else:
                    finish(shot)
                continue
            if JUDGE:
                report.send("imageReview", step(shot, 0.45 + 0.5 * attempt), f"Checking {shot['label']}", force=True,
                            imageIndex=shot["idx"])
            verdict = judge(take["image"], take["target"], take["plan"], take["info"], shot["idx"], attempt)
            score = verdict[0] if verdict else 5.0
            shot["takes"].append({"path": take["path"], "prompt": take["prompt"], "take": attempt + 1, "score": score,
                                  "mask": take["mask"], "info": take["info"], "target": take["target"]})
            if verdict:
                print(f"{shot['label']} take {attempt + 1}: score {score:.1f} — {verdict[1]}", flush=True)
            # Two clear failures (a duplicate, the wrong body part, a different piece) earn one more take.
            limit = TAKES + (1 if JUDGE and max(t["score"] for t in shot["takes"]) <= 4 else 0)
            if shot.get("restaged_at") is not None:
                limit = shot["restaged_at"] + TAKES  # the display shot gets takes of its own
            out_of_takes = not verdict or score >= GOOD_ENOUGH or attempt + 1 >= limit
            if out_of_takes and verdict and score < GOOD_ENOUGH and can_restage(shot):
                restage(shot, attempt + 1)
                paint_queue.put((0, next(order), n, attempt + 1, ""))
            elif out_of_takes:
                finish(shot)  # publishable (or nothing to judge with, or out of takes)
            else:
                # A good paste take spoilt only by a copy klein painted beside the real piece: the next take paints
                # that copy out of this one (a fresh take tends to paint the copy again).
                info = take["info"]
                if (info.get("path") == "paste" and not info.get("cleaned") and info.get("raw_score", 0) >= 6
                        and info.get("caps") and set(info["caps"]) <= {"duplicate", "extra"}):
                    boxes = info.get("copies") or copy_boxes(take["path"], info, take["image"].size)
                    if boxes:
                        shot["clean"] = {"path": take["path"], "boxes": boxes, "mask": take["mask"], "info": info,
                                         "prompt": take["prompt"]}
                paint_queue.put((0, next(order), n, attempt + 1, verdict[2] or ""))
            del take
    finally:
        paint_queue.put((-1, -1, None, 0, ""))  # stop the painter after its current take

    if len(failures) == len(targets):
        raise RuntimeError("Every image failed — " + " | ".join(failure_reasons or map(str, failures)))
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
  const setup = CELL_SETUP.replace('__JOB_JSON__', () => pyJson(job))
    .replace('__MODELS_JSON__', () => pyJson(IMAGE_MODELS))
    .replace('__PIP_JSON__', () => pyJson(IMAGE_PIP_PACKAGES));
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
          `Auto-generated for job \`${job.jobId}\` — do not edit. GPU 0 cuts the jewellery out (BiRefNet_HR) and ` +
          `paints with FLUX.2 [klein] 9B; GPU 1 runs Qwen3-VL 8B to plan the shots and judge every take; the CPU ` +
          `restores the jeweller's real product pixels on top of every take (SIFT alignment + detail transfer).`,
      ),
      code(setup),
      code(PRODUCT_RESTORE_PY),
      code(CELL_ENGINE),
      code(CELL_ANALYST),
      code(CELL_CUTOUT),
      code(CELL_GENERATE),
    ],
  };
}
