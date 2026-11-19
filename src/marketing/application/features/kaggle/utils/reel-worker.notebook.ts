import { IMAGE_MODELS } from './image-worker.notebook';
import { VIDEO_MODEL_FILES } from './model-cache';
import { WorkerNotebookJob } from './worker-notebook-job';

const md = (source: string) => ({ cell_type: 'markdown', metadata: {}, source });
const code = (source: string) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source });

const CELL_REPORTER = `
import os, sys, json, time, subprocess, shutil, glob, traceback, threading, uuid, random, io, re
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "websocket-client", "requests"], check=False)
import requests, websocket

JOB = json.loads(__JOB_JSON__)
SESSION_START = time.time()
# Inside a warm worker session WORKER survives between jobs (installed engine, running ComfyUI); standalone: empty.
WORKER = globals().setdefault("WORKER", {})


class Reporter:
    """Pushes progress to the ByajBazaar AWS WebSocket (API Gateway). Falls back to HTTPS if the socket is down."""

    def __init__(self, job):
        self.job, self.ws, self.lock = job, None, threading.Lock()
        self.last_sent, self.last_stage = 0.0, None

    def _connect(self):
        url = f"{self.job['wsUrl']}?workerJob={self.job['jobId']}&workerToken={self.job['token']}"
        self.ws = websocket.create_connection(url, timeout=20)

    def send(self, stage, progress, message="", status=None, force=False, **extra):
        now = time.time()
        if not force and stage == self.last_stage and now - self.last_sent < 5:
            return  # at most one update every 5 s per stage
        self.last_sent, self.last_stage = now, stage
        payload = {"action": "marketingProgress", "jobId": self.job["jobId"], "token": self.job["token"],
                   "stage": stage, "progress": int(max(0, min(100, progress))), "message": str(message)[:240]}
        if status:
            payload["status"] = status
        payload.update(extra)
        print(f"[{time.strftime('%H:%M:%S')}] {stage} {payload['progress']}% {message}", flush=True)
        with self.lock:
            for attempt in range(2):
                try:
                    if self.ws is None:
                        self._connect()
                    self.ws.send(json.dumps(payload))
                    return True
                except Exception as e:  # stale socket (API Gateway drops idle sockets): reconnect once
                    print("websocket error:", e, flush=True)
                    try:
                        self.ws and self.ws.close()
                    except Exception:
                        pass
                    self.ws = None
        if self.job.get("apiBaseUrl"):
            try:
                r = requests.post(f"{self.job['apiBaseUrl'].rstrip('/')}/api/v1/public/marketing/worker-events",
                                  json=payload, timeout=20)
                return r.ok
            except Exception as e:
                print("http fallback failed:", e, flush=True)
        return False


report = Reporter(JOB)
report.send("setup", 1, "GPU worker started", force=True)


def gpu_names():
    out = subprocess.run(["nvidia-smi", "-L"], capture_output=True, text=True).stdout
    return [l.strip() for l in out.splitlines() if l.strip()]


def find_ffmpeg():
    exe = shutil.which("ffmpeg")
    if not exe:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "imageio-ffmpeg>=0.5.1"], check=True)  # ffmpeg 7 (xfade)
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
    return exe
`;

/** One-time account check: Kaggle GPU access, model hosting, ffmpeg, and the callback channel. */
const CELL_SETUP_CHECK = `
try:
    gpus = gpu_names()
    if not gpus:
        raise RuntimeError("No GPU in this session. Kaggle needs a verified phone number for GPU access.")
    model_checks = [
        "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors",
        __IMAGE_MODEL_CHECKS__
    ]
    HF_TOKEN = JOB.get("hfToken") or ""
    if HF_TOKEN:  # gated FLUX.2 [klein] 9B: the token's account must have accepted its licence
        model_checks += [__GATED_MODEL_CHECKS__]
    for model_url in model_checks:
        auth = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN and "huggingface.co" in model_url else {}
        r = requests.head(model_url, allow_redirects=True, timeout=30, headers=auth)
        if r.status_code in (401, 403) and auth:
            raise RuntimeError(f"Hugging Face refused {model_url.split('/')[-1]} (HTTP {r.status_code}): accept the "
                               "FLUX.2 [klein] 9B licence on huggingface.co with the account of MARKETING_HF_TOKEN.")
        if r.status_code >= 400:
            raise RuntimeError(f"Model host not reachable: {model_url} (HTTP {r.status_code}). Check Kaggle Internet access.")
    ffmpeg = find_ffmpeg()
    disk = shutil.disk_usage("/tmp").free / 1e9
    need = 120 if JOB.get("modelCache") else 25  # the cache build stages ~52 GB of models
    if disk < need:
        raise RuntimeError(f"Only {disk:.0f} GB free in /tmp; the models need ~{need} GB.")
    info = f"{len(gpus)} GPU: " + "; ".join(g.split(" (UUID")[0] for g in gpus) + f" | /tmp {disk:.0f} GB free"
    if JOB.get("modelCache"):
        # Renders may start on this account now; the model cache keeps building in this session.
        report.send("accountReady", 10, "Account ready — building the model cache", force=True, gpuInfo=info,
                    gpuCount=len(gpus))
    else:
        report.send("completed", 100, "Account ready", status="completed", force=True, gpuInfo=info,
                    gpuCount=len(gpus))
except Exception as e:
    traceback.print_exc()
    report.send("failed", 0, f"Setup check failed: {e}", status="failed", force=True)
    raise
`;

/**
 * Setup, second part: downloads every model once and publishes them as a private dataset on this account, so warm
 * worker sessions mount them under /kaggle/input instead of downloading ~52 GB. Never fails the account: on any
 * problem it reports the error and workers keep downloading.
 */
const CELL_MODEL_CACHE = `
def cache_download(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 1_000_000:
        return
    part = dst + ".part"
    token = JOB.get("hfToken") or ""
    for attempt in range(1, 6):
        done = os.path.getsize(part) if os.path.exists(part) else 0
        headers = {"Authorization": f"Bearer {token}"} if token and "huggingface.co" in url else {}
        if done:
            headers["Range"] = f"bytes={done}-"
        try:
            with requests.get(url, stream=True, headers=headers, timeout=(30, 300)) as r:
                if done and r.status_code != 206:
                    done = 0
                r.raise_for_status()
                with open(part, "ab" if done else "wb") as f:
                    for chunk in r.iter_content(16 * 1024 * 1024):
                        f.write(chunk)
            os.replace(part, dst)
            return
        except requests.RequestException as e:
            print(f"download attempt {attempt} failed: {e}", flush=True)
            time.sleep(5 * attempt)
    raise RuntimeError(f"Could not download {url}")


def kaggle_cli(*args, check=True):
    r = subprocess.run(["kaggle", *args], capture_output=True, text=True)
    print("kaggle", " ".join(args[:2]), "->", (r.stdout + r.stderr).strip()[-600:], flush=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"kaggle {' '.join(args[:2])} failed: {(r.stderr or r.stdout).strip()[-300:]}")
    return r


def dataset_state(ref):
    r = kaggle_cli("datasets", "status", ref, check=False)
    text = (r.stdout + r.stderr).lower()
    return "missing" if r.returncode != 0 else "ready" if "ready" in text else "error" if "error" in text else "pending"


CACHE = JOB.get("modelCache")
if CACHE:
    try:
        ref = CACHE["dataset"]
        key = CACHE["key"]
        os.environ["KAGGLE_USERNAME"] = CACHE["username"]
        os.makedirs(os.path.expanduser("~/.kaggle"), exist_ok=True)
        if key.startswith("KGAT_"):  # new-style API token
            os.environ["KAGGLE_API_TOKEN"] = key
            open(os.path.expanduser("~/.kaggle/access_token"), "w").write(key)
        else:
            os.environ["KAGGLE_KEY"] = key
            json.dump({"username": CACHE["username"], "key": key}, open(os.path.expanduser("~/.kaggle/kaggle.json"), "w"))
        os.chmod(os.path.expanduser("~/.kaggle"), 0o700)
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-U", "kaggle", "huggingface_hub"], check=True)

        state = dataset_state(ref)
        if state != "ready":
            DIR = "/tmp/bb-model-cache"
            os.makedirs(DIR, exist_ok=True)
            manifest = {"dataset": ref, "files": []}
            items = len(CACHE["comfy"]) + len(CACHE["hf"])
            for i, f in enumerate(CACHE["comfy"]):
                report.send("modelCache", 12 + 40 * i / items, f"Downloading models for the cache ({i + 1}/{items})")
                name = "comfy--" + f["path"].replace("/", "--")
                cache_download(f["url"], os.path.join(DIR, name))
                manifest["files"].append({"name": name, "kind": "comfy", "path": f["path"]})
            from huggingface_hub import snapshot_download
            for j, repo in enumerate(CACHE["hf"]):
                n = len(CACHE["comfy"]) + j
                report.send("modelCache", 12 + 40 * n / items, f"Downloading models for the cache ({n + 1}/{items})")
                local = snapshot_download(repo, local_dir=f"/tmp/bb-hf-stage/{repo.replace('/', '--')}")
                for root, dirs, files in os.walk(local):
                    dirs[:] = [d for d in dirs if not d.startswith(".")]
                    for fn in files:
                        rel = os.path.relpath(os.path.join(root, fn), local)
                        name = "hf--" + repo.replace("/", "--") + "--" + rel.replace("/", "--")
                        os.replace(os.path.join(root, fn), os.path.join(DIR, name))
                        manifest["files"].append({"name": name, "kind": "hf", "repo": repo, "path": rel})
            json.dump(manifest, open(os.path.join(DIR, "byajbazaar-models.json"), "w"))
            json.dump({"title": "ByajBazaar models " + ref.split("-")[-1], "id": ref,
                       "licenses": [{"name": "other"}]}, open(os.path.join(DIR, "dataset-metadata.json"), "w"))
            size = sum(os.path.getsize(os.path.join(DIR, n)) for n in os.listdir(DIR)) / 1e9
            report.send("modelCache", 55, f"Uploading the private model cache ({size:.0f} GB)", force=True)
            if state == "missing":
                kaggle_cli("datasets", "create", "-p", DIR, "-q")  # private unless --public
            else:
                kaggle_cli("datasets", "version", "-p", DIR, "-m", "ByajBazaar models", "-q")
            started = time.time()
            while time.time() - started < 90 * 60:
                state = dataset_state(ref)
                if state in ("ready", "error"):
                    break
                report.send("modelCache", 90, "Kaggle is processing the model cache")
                time.sleep(60)
            if state != "ready":
                raise RuntimeError(f"the dataset is {state} after upload")
        report.send("completed", 100, "Account ready · model cache built", status="completed", force=True,
                    modelsDataset=ref)
    except Exception as e:
        traceback.print_exc()
        report.send("completed", 100, f"Account ready (model cache not built: {e})"[:240], status="completed",
                    force=True, modelsCacheError=str(e)[:400])
`;

const CELL_INSTALL = `
try:
    GPUS = gpu_names()
    GPU_COUNT = len(GPUS)
    if GPU_COUNT < 1:
        raise RuntimeError("No GPU in this session (accelerator must be GPU T4 x2).")
    BIG_DIR = "/tmp"
    COMFY_DIR = f"{BIG_DIR}/ComfyUI"
    OUT_DIR = "/kaggle/working/outputs"
    os.makedirs(OUT_DIR, exist_ok=True)

    def pip(*args):
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", *args], check=True)

    report.send("setup", 3, f"Installing video engine ({GPU_COUNT} GPU)", force=True)
    MERGE_ONLY = not JOB.get("clips")  # joining finished clips needs ffmpeg only, no video model
    if not MERGE_ONLY and not WORKER.get("video_installed"):
        if not os.path.isdir(COMFY_DIR):
            subprocess.run(["git", "clone", "--depth", "1", "https://github.com/comfyanonymous/ComfyUI.git", COMFY_DIR], check=True)
        C2C_DIR = f"{COMFY_DIR}/custom_nodes/ComfyUI-CustomNodePacks"
        if not os.path.isdir(C2C_DIR):
            subprocess.run(["git", "clone", "--depth", "1", "https://github.com/Code2Collapse/ComfyUI-CustomNodePacks.git", C2C_DIR], check=True)
        pip("-r", f"{COMFY_DIR}/requirements.txt")
        WORKER["video_installed"] = True
    FFMPEG = find_ffmpeg()
    report.send("setup", 6, "Video engine installed", force=True)
except Exception as e:
    report.send("failed", 0, f"Setup failed: {e}", status="failed", force=True)
    raise
`;

const CELL_MODELS = `
MODEL_FILES = __VIDEO_MODEL_FILES__


def download(url, rel, base_pct, span_pct, retries=4):
    dst = os.path.join(COMFY_DIR, rel)
    part = dst + ".part"
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and os.path.getsize(dst) > 100_000_000:
        return
    for attempt in range(1, retries + 1):
        done = os.path.getsize(part) if os.path.exists(part) else 0
        headers = {"Range": f"bytes={done}-"} if done else {}
        try:
            with requests.get(url, stream=True, headers=headers, timeout=(30, 300)) as r:
                if done and r.status_code != 206:
                    done = 0
                r.raise_for_status()
                total = int(r.headers.get("Content-Length", 0)) + done
                with open(part, "ab" if done else "wb") as f:
                    for chunk in r.iter_content(16 * 1024 * 1024):
                        f.write(chunk)
                        done += len(chunk)
                        if total:
                            report.send("downloading", base_pct + span_pct * done / total,
                                        f"Downloading models ({done/1e9:.1f}/{total/1e9:.1f} GB)")
            os.replace(part, dst)
            return
        except requests.RequestException as e:
            print(f"attempt {attempt} failed: {e}")
            time.sleep(5)
    raise RuntimeError(f"Could not download {rel}")


try:
    for (url, rel), (base, span) in zip(MODEL_FILES, [(6, 18), (24, 5), (29, 1)]):  # 6..30 %
        download(url, rel, base, span)
    report.send("downloading", 30, "Models ready", force=True)
except Exception as e:
    report.send("failed", 0, f"Model download failed: {e}", status="failed", force=True)
    raise
`;

const CELL_COMFY = `
try:
    COMFY = "http://127.0.0.1:8188"
    cached = WORKER.get("comfy_video")
    if cached and cached["proc"].poll() is None:  # warm session: Wan is already loaded
        comfy_proc, OBJECT_INFO = cached["proc"], cached["info"]
    else:
        subprocess.run(["pkill", "-f", f"{COMFY_DIR}/main.py"], check=False)
        time.sleep(3)
        env = dict(os.environ)
        env.pop("CUDA_VISIBLE_DEVICES", None)
        env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
        COMFY_LOG = f"{BIG_DIR}/comfyui.log"
        comfy_proc = subprocess.Popen(
            [sys.executable, f"{COMFY_DIR}/main.py", "--listen", "127.0.0.1", "--port", "8188",
             "--disable-pinned-memory", "--reserve-vram", "1.0", "--preview-method", "none"],
            cwd=COMFY_DIR, env=env, stdout=open(COMFY_LOG, "w"), stderr=subprocess.STDOUT)
        for _ in range(180):
            if comfy_proc.poll() is not None:
                break
            try:
                if requests.get(f"{COMFY}/system_stats", timeout=3).ok:
                    break
            except requests.RequestException:
                pass
            time.sleep(2)
        if comfy_proc.poll() is not None:
            raise RuntimeError("ComfyUI exited: " + open(COMFY_LOG).read()[-1500:])
        OBJECT_INFO = requests.get(f"{COMFY}/object_info", timeout=60).json()
        WORKER["comfy_video"] = {"proc": comfy_proc, "info": OBJECT_INFO}  # the warm session stops it when switching
    NODES = set(OBJECT_INFO.keys())
    report.send("rendering", 32, "Video engine ready", force=True)
except Exception as e:
    report.send("failed", 0, f"Video engine failed to start: {e}", status="failed", force=True)
    raise
`;

/** Clip rendering + Reel encode + upload, and the crossfade merge. merge_clips() is also unit-tested locally. */
export const CELL_RENDER_AND_MERGE = `
PRESETS = {
    # Wan 2.2 TI2V-5B is trained at 1280x704 (portrait 704x1280); everything is upscaled to 1080x1920 afterwards.
    "reel_hq":   {"width": 704, "height": 1280, "frames": 121, "fps": 24, "steps": 30},
    "reel_fast": {"width": 480, "height": 832, "frames": 121, "fps": 24, "steps": 20},
}
# Smaller sizes tried, in order, when a clip runs out of GPU memory (all multiples of 32, 9:16-ish).
SIZE_LADDER = [(704, 1280), (608, 1088), (544, 960), (480, 832)]
# Higher denoise and a gentler shift preserve jewellery detail without making the motion too mechanical.
CFG, SHIFT = 4.5, 6.0
VIDEO_EXT = (".mp4", ".webm", ".mov", ".mkv")
OUT_W, OUT_H, OUT_FPS = 1080, 1920, 30
# Transitions between scenes (smooth / diffusion-like), and into the logo.
SCENE_TRANSITIONS = ["fade", "smoothleft", "dissolve", "circleopen", "smoothup"]
LOGO_TRANSITION = "fadewhite"
TRANSITION_SECONDS = 0.7


def decode_node(samples, vae):
    """Tiled VAE decode (121 frames at once does not fit a T4); plain decode on old ComfyUI checkouts."""
    info = OBJECT_INFO.get("VAEDecodeTiled")
    if not info:
        return {"class_type": "VAEDecode", "inputs": {"samples": samples, "vae": vae}}
    inputs = {"samples": samples, "vae": vae}
    preferred = {"tile_size": 256, "overlap": 64, "temporal_size": 32, "temporal_overlap": 8}
    for name, item in info.get("input", {}).get("required", {}).items():
        if name in inputs:
            continue
        cfg = item[1] if len(item) > 1 and isinstance(item[1], dict) else {}
        inputs[name] = preferred.get(name, cfg.get("default"))
    return {"class_type": "VAEDecodeTiled", "inputs": inputs}


def is_oom(error):
    text = str(error).lower()
    return "out of memory" in text or "allocation on device" in text or "outofmemory" in text


def free_comfy_memory():
    try:
        requests.post(f"{COMFY}/free", json={"unload_models": True, "free_memory": True}, timeout=60)
        time.sleep(5)
    except requests.RequestException as exc:
        print("could not free ComfyUI memory:", exc, flush=True)


def render_clip_safely(clip, p, idx, count):
    """render_clip, stepping down SIZE_LADDER when the GPU runs out of memory instead of failing the clip."""
    start = next((i for i, (w, h) in enumerate(SIZE_LADDER) if w <= p["width"] and h <= p["height"]), 0)
    for rung in range(start, len(SIZE_LADDER)):
        width, height = SIZE_LADDER[rung]
        try:
            return render_clip(clip, dict(p, width=width, height=height), idx, count)
        except Exception as exc:
            if not is_oom(exc) or rung == len(SIZE_LADDER) - 1:
                raise
            free_comfy_memory()
            smaller = SIZE_LADDER[rung + 1]
            report.send("rendering", 32 + 56 * idx / count, f"Out of GPU memory at {width}x{height} — retrying at "
                        f"{smaller[0]}x{smaller[1]}", force=True, clipKey=clip["key"])


def make_workflow(prompt, negative, seed, p, image_name, prefix):
    latent = {"width": p["width"], "height": p["height"], "length": p["frames"], "batch_size": 1, "vae": ["39", 0]}
    model_ref = ["48", 0]
    wf = {
        "37": {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.2_ti2v_5B_fp16.safetensors", "weight_dtype": "default"}},
        "38": {"class_type": "CLIPLoader", "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}},
        "39": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
        "6":  {"class_type": "CLIPTextEncode", "inputs": {"clip": ["38", 0], "text": prompt}},
        "7":  {"class_type": "CLIPTextEncode", "inputs": {"clip": ["38", 0], "text": negative}},
        "48": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["37", 0], "shift": SHIFT}},
        "55": {"class_type": "Wan22ImageToVideoLatent", "inputs": latent},
        "8":  decode_node(["3", 0], ["39", 0]),
        "57": {"class_type": "CreateVideo", "inputs": {"images": ["8", 0], "fps": p["fps"]}},
        "58": {"class_type": "SaveVideo", "inputs": {"video": ["57", 0], "filename_prefix": prefix, "format": "auto", "codec": "auto"}},
    }
    if GPU_COUNT >= 2 and "C2CSequenceParallel" in NODES:  # both T4s on every sampling step
        wf["49"] = {"class_type": "C2CSequenceParallel", "inputs": {
            "model": ["48", 0], "gpus": 0, "strategy": "ring", "min_tokens_per_gpu": 1024,
            "fast_link_gpus": 0, "rank_backend": "threads"}}
        model_ref = ["49", 0]
    wf["3"] = {"class_type": "KSampler", "inputs": {
        "model": model_ref, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["55", 0],
        "seed": seed, "steps": p["steps"], "cfg": CFG, "sampler_name": "uni_pc", "scheduler": "simple", "denoise": 1.0}}
    if image_name:
        wf["56"] = {"class_type": "LoadImage", "inputs": {"image": image_name}}
        latent["start_image"] = ["56", 0]
    return wf


def prepare_image(data, w, h):
    from PIL import Image, ImageFilter, ImageOps
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    if abs((img.width / img.height) / (w / h) - 1) < 0.12:
        out = ImageOps.fit(img, (w, h), Image.LANCZOS)
    else:
        out = ImageOps.fit(img, (w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
        fg = ImageOps.contain(img, (w, h), Image.LANCZOS)
        out.paste(fg, ((w - fg.width) // 2, (h - fg.height) // 2))
    buf = io.BytesIO()
    out.save(buf, "PNG")
    return buf.getvalue()


def encode_reel(src, dst):
    """1080x1920 @30 fps H.264 (Instagram Reels), silent AAC track."""
    smooth_fps = (f"minterpolate=fps={OUT_FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
                  if has_filter("minterpolate") else f"fps={OUT_FPS}")
    vf = (f"{smooth_fps},scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase:flags=lanczos,"
          f"crop={OUT_W}:{OUT_H},unsharp=5:5:0.4:5:5:0.0,setsar=1,format=yuv420p")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", src,
                    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                    "-map", "0:v:0", "-map", "1:a:0", "-shortest", "-vf", vf,
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-level", "4.2",
                    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", dst], check=True)


def validate_render(path, width=OUT_W, height=OUT_H, fps=OUT_FPS, min_duration=4.5, min_bytes=1_000_000):
    """Reject bad or under-rendered outputs before upload so the reel pipeline stays production-safe."""
    if not os.path.exists(path):
        raise RuntimeError(f"Rendered output missing: {path}")
    info = subprocess.run([FFMPEG, "-hide_banner", "-i", path], capture_output=True, text=True, check=False)
    out = (info.stderr or info.stdout or "")
    # ffmpeg prints e.g. "Video: h264 (High) (avc1 / 0x31637661), yuv420p(...), 1080x1920 [SAR 1:1], 30 fps":
    # the size needs 2+ digits on both sides so the codec tag (0x3163…) is not read as a resolution.
    line = next((l for l in out.splitlines() if "Video:" in l), "")
    size_m = re.search(r"\\b(\\d{2,5})x(\\d{2,5})\\b", line)
    fps_m = re.search(r"(\\d+(?:\\.\\d+)?)\\s*(?:fps|tbr)", line)
    m = (size_m.group(1), size_m.group(2), fps_m.group(1)) if size_m and fps_m else None
    if not m:
        raise RuntimeError(f"Could not inspect render metadata for {path}")
    video_w, video_h, video_fps = map(float, m)
    duration = video_duration(path)
    size = os.path.getsize(path)
    if duration < min_duration:
        raise RuntimeError(f"Clip too short for reel upload: {duration:.2f}s < {min_duration:.2f}s")
    if video_w < width * 0.9 or video_h < height * 0.9:
        raise RuntimeError(f"Video resolution too low: {int(video_w)}x{int(video_h)} < {width}x{height}")
    if abs(video_fps - fps) > 2:
        raise RuntimeError(f"Video fps too far from target: {video_fps} != {fps}")
    if size < min_bytes:
        raise RuntimeError(f"Video too small for production output: {size} bytes")
    return {"width": int(video_w), "height": int(video_h), "fps": float(video_fps), "duration": duration, "size": size}


def video_duration(path):
    out = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\\d+):(\\d+):([\\d.]+)", out)
    if not m:
        raise RuntimeError(f"Could not read duration of {path}")
    h, mnt, s = m.groups()
    return int(h) * 3600 + int(mnt) * 60 + float(s)


def has_filter(name):
    out = subprocess.run([FFMPEG, "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return re.search(rf"\\s{name}\\s", out) is not None


def merge_clips(paths, dst, transitions, t=TRANSITION_SECONDS):
    """Chains clips with smooth transitions, each normalised to 1080x1920 @30 fps, plus a silent track.
    Uses ffmpeg's xfade (varied transitions, ffmpeg >= 4.3); older builds get an alpha crossfade (dissolve)."""
    if len(paths) == 1:
        shutil.copy2(paths[0], dst)
        return
    durations = [video_duration(p) for p in paths]
    total = sum(durations) - t * (len(paths) - 1)
    inputs, parts = [], []
    for i, p in enumerate(paths):
        inputs += ["-i", p]
        parts.append(f"[{i}:v]scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase,crop={OUT_W}:{OUT_H},"
                     f"fps={OUT_FPS},setsar=1,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v{i}]")
    offsets, offset = [0.0], 0.0
    for i in range(1, len(paths)):
        offset += durations[i - 1] - t
        offsets.append(offset)
    if has_filter("xfade"):
        prev = "v0"
        for i in range(1, len(paths)):
            parts.append(f"[{prev}][v{i}]xfade=transition={transitions[i - 1]}:duration={t}:offset={offsets[i]:.3f}[x{i}]")
            prev = f"x{i}"
        parts.append(f"[{prev}]format=yuv420p[out]")
    else:
        # Base = first clip held to the full length; each next clip fades in (alpha) on top at its offset.
        parts.append(f"[v0]tpad=stop_mode=clone:stop_duration={total - durations[0] + 1:.3f}[b0]")
        prev = "b0"
        for i in range(1, len(paths)):
            parts.append(f"[v{i}]format=yuva420p,fade=t=in:st=0:d={t}:alpha=1,setpts=PTS+{offsets[i]:.3f}/TB[f{i}]")
            parts.append(f"[{prev}][f{i}]overlay=format=yuv420[o{i}]")
            prev = f"o{i}"
        parts.append(f"[{prev}]trim=duration={total:.3f},format=yuv420p[out]")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *inputs,
                    "-f", "lavfi", "-t", f"{total:.3f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                    "-filter_complex", ";".join(parts), "-map", "[out]", "-map", f"{len(paths)}:a",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-level", "4.2",
                    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest", dst], check=True)


def render_clip(clip, p, idx, count, base=32, span=56):
    """Renders one clip; progress maps onto [base, base+span] split evenly across clips."""
    lo = base + span * idx / count
    hi = base + span * (idx + 1) / count
    img = requests.get(clip["imageUrl"], timeout=120)
    img.raise_for_status()
    up = requests.post(f"{COMFY}/upload/image",
                       files={"image": (f"{clip['key']}_{uuid.uuid4().hex[:6]}.png", prepare_image(img.content, p["width"], p["height"]), "image/png")},
                       data={"type": "input", "overwrite": "true"}, timeout=180)
    up.raise_for_status()
    seed = random.randrange(2**63 - 1) if int(clip.get("seed", -1)) < 0 else int(clip["seed"])
    client_id = uuid.uuid4().hex
    cws = websocket.create_connection(f"ws://127.0.0.1:8188/ws?clientId={client_id}", timeout=30)
    prefix = f"reel/{JOB['jobId'][:8]}_{clip['key']}"
    r = requests.post(f"{COMFY}/prompt", timeout=180, json={
        "prompt": make_workflow(clip["prompt"], clip["negative"], seed, p, up.json()["name"], prefix),
        "client_id": client_id})
    if not r.ok:
        raise RuntimeError("ComfyUI rejected the workflow: " + r.text[:1500])
    pid = r.json()["prompt_id"]
    label = "logo" if clip["key"] == "logo" else f"scene {int(clip['key'].split('-')[-1]) + 1}"
    report.send("rendering", lo, f"Rendering {label} ({idx + 1}/{count})", force=True, clipKey=clip["key"])
    t0 = time.time()
    cws.settimeout(600)
    while True:  # ComfyUI WebSocket events instead of polling /history
        if time.time() - t0 > 3 * 3600:
            raise TimeoutError("Rendering took longer than 3 hours")
        try:
            msg = cws.recv()
        except websocket.WebSocketTimeoutException:
            # Long silent steps (model load, VAE decode): ask ComfyUI directly instead of failing the clip.
            hist = requests.get(f"{COMFY}/history/{pid}", timeout=60).json().get(pid, {})
            if hist.get("status", {}).get("completed") or hist.get("outputs"):
                break
            if hist.get("status", {}).get("status_str") == "error":
                raise RuntimeError("ComfyUI reported an error: " + json.dumps(hist.get("status"))[:800])
            report.send("rendering", lo, f"Rendering {label} ({idx + 1}/{count}) · still working", force=True,
                        clipKey=clip["key"])
            continue
        if not isinstance(msg, str):
            continue
        evt = json.loads(msg)
        kind, data = evt.get("type"), evt.get("data", {})
        if data.get("prompt_id") not in (None, pid):
            continue
        if kind == "progress" and data.get("max"):
            report.send("rendering", lo + (hi - lo) * 0.92 * data["value"] / data["max"],
                        f"Rendering {label} ({idx + 1}/{count}) · step {data['value']}/{data['max']}", clipKey=clip["key"])
        elif kind == "execution_error":
            raise RuntimeError(f"{data.get('node_type')}: {data.get('exception_message')}")
        elif kind == "execution_success" or (kind == "executing" and data.get("node") is None):
            break
    cws.close()
    item = requests.get(f"{COMFY}/history/{pid}", timeout=60).json().get(pid, {})
    raw = None
    for out in item.get("outputs", {}).values():
        for key in ("videos", "gifs", "images"):
            for f in out.get(key) or []:
                if isinstance(f, dict) and str(f.get("filename", "")).lower().endswith(VIDEO_EXT):
                    raw = os.path.join(COMFY_DIR, f.get("type") or "output", f.get("subfolder", ""), f["filename"])
    if not raw:
        found = sorted(glob.glob(os.path.join(COMFY_DIR, "output", prefix + "*")), key=os.path.getmtime)
        if not found:
            raise RuntimeError(f"No video produced for {clip['key']}")
        raw = found[-1]
    reel = os.path.join(OUT_DIR, f"{clip['key']}.mp4")
    encode_reel(raw, reel)
    validate_render(reel, OUT_W, OUT_H, OUT_FPS, min_duration=4.5, min_bytes=1_000_000)
    with open(reel, "rb") as fh:
        requests.put(clip["uploadUrl"], data=fh, headers={"Content-Type": "video/mp4"}, timeout=600).raise_for_status()
    report.send("clipDone", hi, f"{label.capitalize()} ready", force=True, clipKey=clip["key"])
    return reel
`;

const CELL_RUN = `
class SessionHandover(Exception):
    """Raised when the next step would not finish inside this Kaggle session."""


def time_left():
    return JOB.get("sessionBudgetSeconds", 11 * 3600) - (time.time() - SESSION_START)


def handover(progress, what):
    report.send("sessionExpiring", progress, f"Kaggle session time almost up before {what} — continuing in a new session",
                force=True)
    raise SessionHandover(what)


def run():
    p = PRESETS.get(JOB.get("preset") or "reel_fast", PRESETS["reel_fast"])
    clips = JOB.get("clips") or []
    local, failed, clip_seconds = {}, [], []
    default_clip = 3600 if JOB.get("preset") == "reel_hq" else 1800  # first-clip guess on T4 x2; premium jobs need more time budget to stay stable
    for i, clip in enumerate(clips):
        estimate = (sum(clip_seconds) / len(clip_seconds)) if clip_seconds else default_clip
        if time_left() < estimate * 1.2 + 300:
            handover(32 + 56 * i / max(1, len(clips)), f"clip {clip['key']}")
        started = time.time()
        try:
            local[clip["key"]] = render_clip_safely(clip, p, i, len(clips))
            clip_seconds.append(time.time() - started)
        except Exception as e:  # keep going: one bad scene must not lose the others
            traceback.print_exc()
            failed.append(clip["key"])
            report.send("clipFailed", 32 + 56 * (i + 1) / max(1, len(clips)), f"{type(e).__name__}: {e}",
                        force=True, clipKey=clip["key"])

    merge = JOB.get("merge")
    if merge:
        if time_left() < 900:
            handover(90, "merging")
        report.send("merging", 90, "Merging scenes with transitions", force=True)
        def fetch(key, url):
            path = os.path.join(OUT_DIR, f"src_{key}.mp4")
            r = requests.get(url, timeout=300)
            r.raise_for_status()
            open(path, "wb").write(r.content)
            return path
        paths = []
        for key in merge["order"]:
            if key in local:
                paths.append(local[key])
            elif merge["sources"].get(key):
                paths.append(fetch(key, merge["sources"][key]))
        transitions = [SCENE_TRANSITIONS[i % len(SCENE_TRANSITIONS)] for i in range(max(0, len(paths) - 1))]
        logo_key = merge.get("logoKey")
        if logo_key and logo_key in local:
            paths.append(local[logo_key]); transitions.append(LOGO_TRANSITION)
        elif merge.get("logoUrl"):
            paths.append(fetch("logo", merge["logoUrl"])); transitions.append(LOGO_TRANSITION)
        if len(paths) >= 2:
            merged = os.path.join(OUT_DIR, "merged.mp4")
            merge_clips(paths, merged, transitions)
            report.send("merging", 96, "Uploading merged video", force=True)
            with open(merged, "rb") as fh:
                requests.put(merge["uploadUrl"], data=fh, headers={"Content-Type": "video/mp4"}, timeout=900).raise_for_status()
            report.send("mergeDone", 98, "Merged video ready", force=True)

    if clips and len(failed) == len(clips):
        raise RuntimeError("Every clip failed: " + ", ".join(failed))
    report.send("completed", 100, f"Done ({len(clips) - len(failed)}/{len(clips)} clips)", status="completed",
                force=True, failedClips=failed)


try:
    run()
except SessionHandover as h:
    print(f"Handing over to a new Kaggle session before {h}.")  # the backend restarts the job; done clips are kept
except Exception as e:
    traceback.print_exc()
    report.send("failed", 0, f"{type(e).__name__}: {e}", status="failed", force=True)
    raise
`;

/** Image-notebook models the setup check makes sure the account can download. */
const IMAGE_MODEL_CHECKS = [
  `https://huggingface.co/${IMAGE_MODELS.segmenter}/resolve/main/config.json`,
  `https://huggingface.co/${IMAGE_MODELS.analyst}/resolve/main/config.json`,
  IMAGE_MODELS.kleinTextEncoder,
  IMAGE_MODELS.kleinVae,
]
  .map((url) => JSON.stringify(url) + ',')
  .join('\n        ');
/** Gated downloads, checked only when a Hugging Face token is configured. */
const GATED_MODEL_CHECKS = JSON.stringify(IMAGE_MODELS.kleinDiffusion);

/** Python string literal holding the job JSON (JSON escapes are valid Python string escapes). */
function jobLiteral(job: WorkerNotebookJob): string {
  return JSON.stringify(JSON.stringify(job));
}

/** VIDEO_MODEL_FILES as a Python list of (url, path) tuples (JSON strings are valid Python strings). */
const VIDEO_MODEL_FILES_PY =
  '[\n' +
  VIDEO_MODEL_FILES.map((f) => `    (${JSON.stringify(f.url)},\n     ${JSON.stringify(f.path)}),`).join('\n') +
  '\n]';

export function buildWorkerNotebook(job: WorkerNotebookJob): Record<string, unknown> {
  // Function replacement: a `$` in the job (titles, presigned URLs) must not be read as a replacement pattern.
  const reporter = CELL_REPORTER.replace('__JOB_JSON__', () => jobLiteral(job));
  const cells =
    job.kind === 'setup'
      ? [
          code(reporter),
          code(
            CELL_SETUP_CHECK.replace('__IMAGE_MODEL_CHECKS__', () => IMAGE_MODEL_CHECKS).replace(
              '__GATED_MODEL_CHECKS__',
              () => GATED_MODEL_CHECKS,
            ),
          ),
          code(CELL_MODEL_CACHE),
        ]
      : job.clips?.length
        ? [
            code(reporter),
            code(CELL_INSTALL),
            code(CELL_MODELS.replace('__VIDEO_MODEL_FILES__', () => VIDEO_MODEL_FILES_PY)),
            code(CELL_COMFY),
            code(CELL_RENDER_AND_MERGE),
            code(CELL_RUN),
          ]
        : // Merge-only job (the clips were rendered in parallel by other jobs): no video model, no ComfyUI.
          [code(reporter), code(CELL_INSTALL), code(CELL_RENDER_AND_MERGE), code(CELL_RUN)];
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
        `# ByajBazaar marketing ${job.kind === 'setup' ? 'account setup' : 'render'} worker\n\n` +
          `Auto-generated for job \`${job.jobId}\` — do not edit. Reports live progress to the ByajBazaar WebSocket.`,
      ),
      ...cells,
    ],
  };
}
