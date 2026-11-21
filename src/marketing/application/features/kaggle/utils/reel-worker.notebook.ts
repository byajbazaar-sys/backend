import { COLAB_RUNTIME_PY } from './colab-runtime.notebook';
import { IMAGE_MODELS } from './image-worker.notebook';
import { FAST_VIDEO_MODEL_FILES, VIDEO_MODEL_FILES, VIDEO_MODEL_NAMES, VOICE_MODEL_FILES } from './model-cache';
import { PRODUCT_RESTORE_PY } from './product-restore.notebook';
import { WorkerNotebookJob } from './worker-notebook-job';

const md = (source: string) => ({ cell_type: 'markdown', metadata: {}, source });
const code = (source: string) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source });

/** Progress reporter + helpers shared with the voice notebook (JOB, WORKER, report, gpu_names, find_ffmpeg). */
export const CELL_REPORTER = `
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
        self.job, self.ws, self.lock, self.send_lock = job, None, threading.Lock(), threading.Lock()
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
        self._enqueue(payload, wait=bool(status))
        return True

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
    COLAB = JOB.get("provider") == "colab"
    gpus = gpu_names()
    if not gpus:
        raise RuntimeError("No GPU in this session. " + (
            "Check the Colab account's GPU type and the project's GPU quota in its region." if COLAB else
            "Kaggle needs a verified phone number for GPU access."))
    model_checks = [
        __VIDEO_MODEL_CHECKS__
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
            raise RuntimeError(f"Model host not reachable: {model_url} (HTTP {r.status_code}). Check the notebook's "
                               "Internet access.")
    ffmpeg = find_ffmpeg()
    disk = big_disk()  # Colab: the heavy folders go to the VM's largest disk
    need = 120 if JOB.get("modelCache") else 25  # the cache build stages ~52 GB of models
    if disk < need:
        raise RuntimeError(f"Only {disk:.0f} GB of disk free; the models need ~{need} GB" +
                           (" (raise the Colab account's disk size)." if COLAB else "."))
    info = (("Colab " if COLAB else "") + f"{len(gpus)} GPU: " + "; ".join(g.split(" (UUID")[0] for g in gpus) +
            f" | {disk:.0f} GB free")
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


def build_cache_dir(ref):
    """Every model file downloaded once into one folder, with the manifest the sessions read."""
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
    return DIR


def publish_to_gcs(DIR, ref):
    """Colab Enterprise: the cache goes to the account's bucket (same region: fast, no egress). The manifest is
    written last, so a half-finished upload is never taken for a cache."""
    from concurrent.futures import ThreadPoolExecutor
    names = [n for n in os.listdir(DIR) if n != "byajbazaar-models.json" and not n.endswith(".part")]
    size = sum(os.path.getsize(os.path.join(DIR, n)) for n in names) / 1e9
    report.send("modelCache", 55, f"Uploading the model cache to Cloud Storage ({size:.0f} GB)", force=True)
    done = [0]

    def one(name):
        gcs_upload(os.path.join(DIR, name), f"{ref}/{name}")
        done[0] += 1
        report.send("modelCache", 55 + 40 * done[0] / max(1, len(names)),
                    f"Uploading the model cache ({done[0]}/{len(names)})")

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(one, names))
    gcs_upload(os.path.join(DIR, "byajbazaar-models.json"), f"{ref}/byajbazaar-models.json")


CACHE = JOB.get("modelCache")
if CACHE and CACHE.get("provider") == "colab":
    try:
        ref = CACHE["dataset"]
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-U", "huggingface_hub"], check=True)
        if gcs_exists(f"{ref}/byajbazaar-models.json"):
            print("The model cache is already in Cloud Storage:", ref, flush=True)
        else:
            publish_to_gcs(build_cache_dir(ref), ref)
        report.send("completed", 100, "Account ready · model cache built", status="completed", force=True,
                    modelsDataset=ref)
    except Exception as e:
        traceback.print_exc()
        report.send("completed", 100, f"Account ready (model cache not built: {e})"[:240], status="completed",
                    force=True, modelsCacheError=str(e)[:400])
elif CACHE:
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
            DIR = build_cache_dir(ref)
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

export const CELL_INSTALL = `
try:
    GPUS = gpu_names()
    GPU_COUNT = len(GPUS)
    if GPU_COUNT < 1:
        raise RuntimeError("No GPU in this session (accelerator must be GPU T4 x2).")
    BIG_DIR = "/tmp"
    COMFY_DIR = f"{BIG_DIR}/ComfyUI"
    OUT_DIR = ("/kaggle/working" if os.path.isdir("/kaggle/working") else "/tmp") + "/outputs"
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        import cv2
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "opencv-python-headless"], check=True)
        import cv2
    import numpy as np
    from PIL import Image, ImageOps

    def pip(*args):
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", *args], check=True)

    # Custom nodes: the GGUF loader (required: the Wan experts are GGUF), MultiGPU (each Wan expert stays resident on
    # its own T4, so they never swap) and RIFE frame interpolation (16 -> 32 fps). The last two are optional: without
    # them the experts share GPU 0 and ffmpeg blends frames instead.
    FAST = bool(globals().get("FAST_VIDEO"))  # the fast notebook (TI2V-5B) sets it before this cell
    NODE_PACKS = {
        # Fast render: one core-loaded model, split over both T4s by C2C Multi-GPU Split (optional: one GPU without).
        "ComfyUI-CustomNodePacks": ("https://github.com/Code2Collapse/ComfyUI-CustomNodePacks.git", [], False),
    } if FAST else {
        "ComfyUI-GGUF": ("https://github.com/city96/ComfyUI-GGUF.git", ["gguf>=0.13.0", "sentencepiece", "protobuf"], True),
        "ComfyUI-MultiGPU": ("https://github.com/pollockjj/ComfyUI-MultiGPU.git", [], False),
        "ComfyUI-Frame-Interpolation": ("https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git",
                                        ["-r", "<dir>/requirements-no-cupy.txt"], False),
    }
    RIFE_URLS = ["https://huggingface.co/marduk191/rife/resolve/main/rife47.pth",
                 "https://huggingface.co/MachineDelusions/RIFE/resolve/main/rife47.pth"]
    INSTALL_ERROR = []
    HANDOFF_NODE = """
import os
import torch


class BBSaveHandoff:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"positive": ("CONDITIONING",), "negative": ("CONDITIONING",), "latent": ("LATENT",),
                             "path": ("STRING", {"default": ""})}}

    RETURN_TYPES = ()
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "byajbazaar"

    def save(self, positive, negative, latent, path):
        part = path + ".part"
        torch.save({"positive": positive, "negative": negative, "latent": latent}, part)
        os.replace(part, path)
        return {"ui": {"handoff": [path]}}


class BBLoadHandoff:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"path": ("STRING", {"default": ""})}}

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "LATENT")
    FUNCTION = "load"
    CATEGORY = "byajbazaar"

    @classmethod
    def IS_CHANGED(cls, path):
        return os.path.getmtime(path) if os.path.exists(path) else float("nan")

    def load(self, path):
        data = torch.load(path, map_location="cpu", weights_only=False)
        return (data["positive"], data["negative"], data["latent"])


NODE_CLASS_MAPPINGS = {"BBSaveHandoff": BBSaveHandoff, "BBLoadHandoff": BBLoadHandoff}
"""

    def install_requirements():
        """ComfyUI's and the node packs' packages, in the background while the models download (a warm session
        installs ComfyUI's at boot; never two pip installs at once)."""
        try:
            boot = WORKER.get("boot", {}).get("comfy_requirements")
            if boot is not None:
                boot.wait(1500)
            if not WORKER.get("comfy_requirements"):
                pip("-r", f"{COMFY_DIR}/requirements.txt")
                WORKER["comfy_requirements"] = True
            for name, (url, reqs, required) in NODE_PACKS.items():
                folder = f"{COMFY_DIR}/custom_nodes/{name}"
                args = [r.replace("<dir>", folder) for r in reqs]
                if not reqs or not os.path.isdir(folder) or ("-r" in args and not os.path.exists(args[-1])):
                    continue
                try:
                    pip(*args)
                except Exception as exc:
                    if required:
                        raise
                    print(f"{name} packages failed ({exc}); continuing without it", flush=True)
        except Exception as exc:
            INSTALL_ERROR.append(f"{type(exc).__name__}: {exc}")

    report.send("setup", 3, f"Installing video engine ({GPU_COUNT} GPU)", force=True)
    NEED_GPU = any(c["key"] != "logo" for c in JOB.get("clips") or [])  # the logo clip is animated on the CPU
    INSTALLER = None
    if NEED_GPU and not WORKER.get("video_installed"):
        if not os.path.isdir(COMFY_DIR):
            subprocess.run(["git", "clone", "--depth", "1", "https://github.com/comfyanonymous/ComfyUI.git", COMFY_DIR], check=True)
        for name, (url, reqs, required) in NODE_PACKS.items():
            folder = f"{COMFY_DIR}/custom_nodes/{name}"
            if os.path.isdir(folder):
                continue
            done = subprocess.run(["git", "clone", "--depth", "1", url, folder], capture_output=True, text=True)
            if done.returncode != 0:
                if required:
                    raise RuntimeError(f"Could not install {name}: {done.stderr.strip()[-300:]}")
                print(f"{name} not installed ({done.stderr.strip()[-200:]}); continuing without it", flush=True)
        rife = f"{COMFY_DIR}/custom_nodes/ComfyUI-Frame-Interpolation/ckpts/rife/rife47.pth"
        if not FAST and os.path.isdir(os.path.dirname(os.path.dirname(os.path.dirname(rife)))) and not os.path.exists(rife):
            os.makedirs(os.path.dirname(rife), exist_ok=True)
            for url in RIFE_URLS:
                try:
                    r = requests.get(url, timeout=120)
                    r.raise_for_status()
                    open(rife, "wb").write(r.content)
                    break
                except Exception as exc:
                    print("RIFE checkpoint download failed:", exc, flush=True)
        INSTALLER = threading.Thread(target=install_requirements, daemon=True)
        INSTALLER.start()
    if NEED_GPU and not FAST:
        # Two tiny nodes that pass the high-noise pass's result (conditioning + latent, unchanged tensors) from the
        # ComfyUI on GPU 0 to the one on GPU 1, so each runs its own Wan expert and the two overlap across clips.
        open(f"{COMFY_DIR}/custom_nodes/bb_handoff.py", "w").write(HANDOFF_NODE)
    FFMPEG = find_ffmpeg()
    report.send("setup", 6, "Video engine installed", force=True)
except Exception as e:
    report.send("failed", 0, f"Setup failed: {e}", status="failed", force=True)
    raise
`;

export const CELL_MODELS = `
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
    if NEED_GPU:
        for i, (url, rel) in enumerate(MODEL_FILES):  # 6..30 %, one equal slice per file
            download(url, rel, 6 + 24 * i / len(MODEL_FILES), 24 / len(MODEL_FILES))
    if INSTALLER is not None:
        report.send("downloading", 30, "Finishing the video engine install", force=True)
        INSTALLER.join()
        if INSTALL_ERROR:
            raise RuntimeError("ComfyUI install failed: " + INSTALL_ERROR[0])
        WORKER["video_installed"] = True
    report.send("downloading", 30, "Models ready", force=True)
except Exception as e:
    report.send("failed", 0, f"Model download failed: {e}", status="failed", force=True)
    raise
`;

export const CELL_COMFY = `
COMFY = "http://127.0.0.1:8188"
COMFY_LOG = f"{BIG_DIR}/comfyui.log"
HANDOFF_DIR = f"{BIG_DIR}/bb-handoff"
COMFY_FLAGS = ["--disable-pinned-memory", "--reserve-vram", "0.8", "--preview-method", "none"]


def mem_available_gb():
    try:
        for line in open("/proc/meminfo"):
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) / 1e6
    except Exception:
        pass
    return 0.0


def launch_comfy(name):
    """Starts one ComfyUI: "a" on port 8188 (GPU 0 — or both GPUs when not split), "b" on 8189 (GPU 1, its own
    user / temp directories so the two never share a database or wipe each other's temp files)."""
    spec = ENGINE_SPECS[name]
    subprocess.run(["pkill", "-f", f"main.py --listen 127.0.0.1 --port {spec['port']}"], check=False)
    time.sleep(3)
    env = dict(os.environ)
    env.pop("CUDA_VISIBLE_DEVICES", None)
    if spec["gpus"] is not None:
        env["CUDA_VISIBLE_DEVICES"] = spec["gpus"]
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    extra = []
    if spec.get("home"):
        os.makedirs(f"{spec['home']}/user", exist_ok=True)
        extra = ["--user-directory", f"{spec['home']}/user", "--temp-directory", spec["home"]]
    proc = subprocess.Popen(
        [sys.executable, f"{COMFY_DIR}/main.py", "--listen", "127.0.0.1", "--port", str(spec["port"]), *COMFY_FLAGS,
         *extra], cwd=COMFY_DIR, env=env, stdout=open(spec["log"], "w"), stderr=subprocess.STDOUT)
    url = f"http://127.0.0.1:{spec['port']}"
    for _ in range(180):
        if proc.poll() is not None:
            break
        try:
            if requests.get(f"{url}/system_stats", timeout=3).ok:
                break
        except requests.RequestException:
            pass
        time.sleep(2)
    if proc.poll() is not None:
        raise RuntimeError(f"ComfyUI ({name}) exited: " + open(spec["log"]).read()[-1500:])
    info = requests.get(f"{url}/object_info", timeout=60).json()
    need = "UNETLoader" if globals().get("FAST_VIDEO") else "UnetLoaderGGUF"
    if need not in info:
        raise RuntimeError(f"ComfyUI has no {need} node: " + open(spec["log"]).read()[-1200:])
    ENGINES[name] = {"name": name, "url": url, "port": spec["port"], "proc": proc, "log": spec["log"]}
    return info


def start_engines(split):
    """split: one ComfyUI per T4, each holding its Wan expert (the clips overlap); else one ComfyUI on both GPUs
    with the experts pinned by ComfyUI-MultiGPU (the clips run one after another)."""
    global SPLIT, OBJECT_INFO, NODES, comfy_proc
    for port in (8188, 8189):
        subprocess.run(["pkill", "-f", f"main.py --listen 127.0.0.1 --port {port}"], check=False)
    ENGINES.clear()
    ENGINE_SPECS.clear()
    if split:
        ENGINE_SPECS["a"] = {"port": 8188, "gpus": "0", "log": COMFY_LOG}
        ENGINE_SPECS["b"] = {"port": 8189, "gpus": "1", "log": f"{BIG_DIR}/comfyui-b.log", "home": "/tmp/comfy-b"}
    else:
        ENGINE_SPECS["a"] = {"port": 8188, "gpus": None, "log": COMFY_LOG}
    OBJECT_INFO = launch_comfy("a")
    if split:
        info_b = launch_comfy("b")
        missing = [n for n in ("BBSaveHandoff", "BBLoadHandoff") if n not in OBJECT_INFO or n not in info_b]
        if missing:
            raise RuntimeError(f"the hand-off nodes did not load: {missing}")
    SPLIT = split
    NODES = set(OBJECT_INFO.keys())
    comfy_proc = ENGINES["a"]["proc"]
    # The warm session stops them when switching pipelines (release_all kills every ComfyUI).
    WORKER["comfy_video"] = {"proc": comfy_proc, "info": OBJECT_INFO, "engines": dict(ENGINES),
                             "specs": dict(ENGINE_SPECS), "split": split}


def restart_engine(name):
    """After a crash: the same ComfyUI again (its expert reloads on the next prompt)."""
    launch_comfy(name)
    WORKER.setdefault("comfy_video", {})["engines"] = dict(ENGINES)
    if name == "a":
        WORKER["comfy_video"]["proc"] = ENGINES["a"]["proc"]


def engine_alive(engine):
    return engine is not None and engine["proc"].poll() is None


def comfy_alive():
    return all(engine_alive(e) for e in ENGINES.values()) if ENGINES else False


try:
    OBJECT_INFO, NODES, SPLIT = {}, set(), False
    ENGINES, ENGINE_SPECS = {}, {}
    os.makedirs(HANDOFF_DIR, exist_ok=True)
    cached = WORKER.get("comfy_video")
    if not NEED_GPU:
        pass  # logo clip only: no GPU work
    elif cached and cached.get("engines") and all(e["proc"].poll() is None for e in cached["engines"].values()):
        # Warm session: Wan is already loaded on both GPUs.
        ENGINES.update(cached["engines"])
        ENGINE_SPECS.update(cached.get("specs") or {})
        OBJECT_INFO, SPLIT = cached["info"], bool(cached.get("split"))
        comfy_proc = ENGINES["a"]["proc"]
        NODES = set(OBJECT_INFO.keys())
    else:
        # Split needs both T4s and a little RAM for the second ComfyUI; if it ever fails, this session stays on one.
        want_split = (GPU_COUNT >= 2 and not globals().get("FAST_VIDEO") and not WORKER.get("video_split_off")
                      and mem_available_gb() >= 8)
        try:
            start_engines(want_split)
        except Exception as exc:
            if not want_split:
                raise
            traceback.print_exc()
            print("Two-engine video setup failed; using one ComfyUI on both GPUs:", exc, flush=True)
            WORKER["video_split_off"] = True
            start_engines(False)
    report.send("rendering", 32, "Video engine ready" + (" · one Wan expert per GPU, clips overlap" if SPLIT else
                                                         " · fast render" if globals().get("FAST_VIDEO") else ""),
                force=True)
except Exception as e:
    report.send("failed", 0, f"Video engine failed to start: {e}", status="failed", force=True)
    raise
`;

/** Clip rendering, the one H.264 encode and upload of each scene clip (each clip is a deliverable; no merged film). */
export const CELL_RENDER_AND_MERGE = `
PRESETS = {
    # Wan 2.2 I2V A14B renders 81 frames at its native 16 fps (5 s); RIFE doubles that to 32 fps, then 30 fps.
    # LightX2V distill: half the steps on the high-noise expert, half on the low-noise expert.
    "reel_hq":   {"width": 544, "height": 960, "frames": 81, "steps": 8},
    "reel_fast": {"width": 480, "height": 832, "frames": 81, "steps": 6},
}
# Smaller sizes tried, in order, when a clip runs out of GPU memory (multiples of 16, 9:16).
SIZE_LADDER = [(544, 960), (480, 832), (448, 784), (416, 736)]
WAN_FPS = 16
SHIFT, CFG = 5.0, 1.0  # LightX2V settings: euler / simple, shift 5, CFG 1 (a negative prompt has no effect at CFG 1)
NAMES = __VIDEO_MODEL_NAMES__
VIDEO_EXT = (".mp4", ".webm", ".mov", ".mkv")
OUT_W, OUT_H, OUT_FPS = 1080, 1920, 30
# Quality gate on every scene take (1/8-size grey frames, 0-255): a frame change above max(QA_JUMP_MIN,
# QA_JUMP_RATIO x the clip's median change) is a cut or morph; a frame-to-frame brightness wobble above QA_FLICKER is
# flicker; the real piece must be matched in at least QA_MIN_LOCKED of the frames. One new take when it fails.
QA_RETRIES, QA_JUMP_MIN, QA_JUMP_RATIO, QA_FLICKER, QA_MIN_LOCKED = 1, 18.0, 6.0, 6.0, 0.4
# The piece may only move with the camera: held off its place by more than this share of the frame width for
# PIECE_DRIFT_FRAMES frames in a row, it was pushed, picked up or turned (a hand came in) — a defect worth a retake.
PIECE_DRIFT_MAX, PIECE_DRIFT_FRAMES = 0.02, 6
# ...and it may not vanish: not found for this many frames in a row (covered, lifted away or melted) is a defect too.
PIECE_GAP_FRAMES = 8
# Kaggle has 4 vCPUs: 3 for matching, restoring and frame loading, one left for the ComfyUIs rendering meanwhile.
CPU_WORKERS = max(2, min(4, os.cpu_count() or 4) - 1)
LOCK_RAMP = 4  # frames over which the rebuilt piece fades in / out next to a frame where it could not be rebuilt


def comfy_node(cls, **inputs):
    """A ComfyUI API node checked against /object_info: unknown inputs fail loudly, missing widgets get defaults."""
    info = OBJECT_INFO.get(cls)
    if info is None:
        raise RuntimeError(f"ComfyUI has no {cls} node")
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


def options_of(cls, name):
    spec = OBJECT_INFO.get(cls, {}).get("input", {})
    item = {**spec.get("required", {}), **spec.get("optional", {})}.get(name)
    if not item:
        return []
    kind = item[0]
    cfg = item[1] if len(item) > 1 and isinstance(item[1], dict) else {}
    return kind if isinstance(kind, list) else cfg.get("options") or []


def is_oom(error):
    text = str(error).lower()
    return "out of memory" in text or "allocation on device" in text or "outofmemory" in text


def free_comfy_memory(engine):
    try:
        requests.post(f"{engine['url']}/free", json={"unload_models": True, "free_memory": True}, timeout=60)
        time.sleep(5)
    except requests.RequestException as exc:
        print("could not free ComfyUI memory:", exc, flush=True)


def is_crash(error, engine):
    """That ComfyUI went away (killed, crashed) or stopped answering: worth one restart, not a failed clip."""
    closed = getattr(websocket, "WebSocketConnectionClosedException", ConnectionError)
    return isinstance(error, (requests.ConnectionError, ConnectionError, closed)) or not engine_alive(engine)


def expert_loader(name, device):
    """One Wan expert on its own T4: split, each ComfyUI sees only its GPU; otherwise pinned by ComfyUI-MultiGPU (no
    swapping between the two 14B experts), or — without it — both share GPU 0 and ComfyUI swaps them."""
    if SPLIT:
        return comfy_node("UnetLoaderGGUF", unet_name=name)
    if GPU_COUNT >= 2 and device in options_of("UnetLoaderGGUFMultiGPU", "device"):
        return comfy_node("UnetLoaderGGUFMultiGPU", unet_name=name, device=device)
    return comfy_node("UnetLoaderGGUF", unet_name=name)


def make_workflow(prompt, seed, p, start_name, end_name, prefix, part="all", handoff=None, negative=None):
    """Wan 2.2 I2V A14B first-last-frame graph: both keyframes are crops of the jeweller's still, so the clip starts
    AND ends on the real piece and the camera move is fixed by the keyframes, not by the prompt.
    part "all": the whole clip in one ComfyUI. Split over two ComfyUIs — the very same nodes and numbers, cut where
    the high-noise expert hands over: "a" (GPU 0) encodes, runs the first half of the steps and saves the
    conditioning + latent to handoff; "b" (GPU 1) loads them, runs the second half, decodes and interpolates.
    Returns (graph, fps of the frames it saves)."""
    steps = int(p["steps"])
    split = steps // 2
    sample = {"steps": steps, "cfg": CFG, "sampler_name": "euler", "scheduler": "simple"}
    g = {}
    if part in ("all", "a"):
        g.update({
            "clip": comfy_node("CLIPLoader", clip_name=NAMES["clip"], type="wan"),
            "vae": comfy_node("VAELoader", vae_name=NAMES["vae"]),
            "pos": comfy_node("CLIPTextEncode", clip=["clip", 0], text=prompt),
            "neg": comfy_node("ConditioningZeroOut", conditioning=["pos", 0]),
            "start": comfy_node("LoadImage", image=start_name),
            "end": comfy_node("LoadImage", image=end_name),
            "hi": expert_loader(NAMES["high"], "cuda:0"),
        })
        g["flf"] = comfy_node("WanFirstLastFrameToVideo", positive=["pos", 0], negative=["neg", 0], vae=["vae", 0],
                              width=p["width"], height=p["height"], length=p["frames"], batch_size=1,
                              start_image=["start", 0], end_image=["end", 0])
        g["hilora"] = comfy_node("LoraLoaderModelOnly", model=["hi", 0], lora_name=NAMES["highLora"],
                                 strength_model=1.0)
        g["hishift"] = comfy_node("ModelSamplingSD3", model=["hilora", 0], shift=SHIFT)
        g["s1"] = comfy_node("KSamplerAdvanced", model=["hishift", 0], add_noise="enable", noise_seed=seed,
                             positive=["flf", 0], negative=["flf", 1], latent_image=["flf", 2], start_at_step=0,
                             end_at_step=split, return_with_leftover_noise="enable", **sample)
        cond = (["flf", 0], ["flf", 1], ["s1", 0])
    if part == "a":
        g["handoff"] = comfy_node("BBSaveHandoff", positive=cond[0], negative=cond[1], latent=cond[2], path=handoff)
        return g, None
    if part == "b":
        g["vae"] = comfy_node("VAELoader", vae_name=NAMES["vae"])
        g["load"] = comfy_node("BBLoadHandoff", path=handoff)
        cond = (["load", 0], ["load", 1], ["load", 2])
    g["lo"] = expert_loader(NAMES["low"], "cuda:1")
    g["lolora"] = comfy_node("LoraLoaderModelOnly", model=["lo", 0], lora_name=NAMES["lowLora"], strength_model=1.0)
    g["loshift"] = comfy_node("ModelSamplingSD3", model=["lolora", 0], shift=SHIFT)
    g["s2"] = comfy_node("KSamplerAdvanced", model=["loshift", 0], add_noise="disable", noise_seed=seed,
                         positive=cond[0], negative=cond[1], latent_image=cond[2], start_at_step=split,
                         end_at_step=10000, return_with_leftover_noise="disable", **sample)
    if "VAEDecodeTiled" in NODES:  # 81 frames at once do not fit a T4
        tiles = {"tile_size": 256, "overlap": 64, "temporal_size": 32, "temporal_overlap": 8}
        known = {**OBJECT_INFO["VAEDecodeTiled"]["input"].get("required", {})}
        g["decode"] = comfy_node("VAEDecodeTiled", samples=["s2", 0], vae=["vae", 0],
                                 **{k: v for k, v in tiles.items() if k in known})
    else:
        g["decode"] = comfy_node("VAEDecode", samples=["s2", 0], vae=["vae", 0])
    frames, fps = ["decode", 0], WAN_FPS
    rife_ckpt = f"{COMFY_DIR}/custom_nodes/ComfyUI-Frame-Interpolation/ckpts/rife/rife47.pth"
    if "RIFE VFI" in NODES and "rife47.pth" in options_of("RIFE VFI", "ckpt_name") and os.path.exists(rife_ckpt):
        extra = {"dtype": "float16"} if "float16" in options_of("RIFE VFI", "dtype") else {}
        g["rife"] = comfy_node("RIFE VFI", ckpt_name="rife47.pth", frames=frames, multiplier=2, fast_mode=False,
                               ensemble=True, **extra)
        frames, fps = ["rife", 0], WAN_FPS * 2
    g["save"] = comfy_node("SaveImage", images=frames, filename_prefix=prefix)
    return g, fps


def camera_move(prompt):
    """(move, reverse) the keyframes must make, read from the CAMERA sentence so they never contradict the text:
    push (in) / pull back, sideways dolly (right, or left), tilt (down, or up), crane (down, or up)."""
    text = str(prompt or "").lower()
    text = text.split("camera:", 1)[1] if "camera:" in text else text
    text = text.split(".", 1)[0]
    if "tilt" in text:
        return "tilt", " up" in f" {text.split('tilt', 1)[1]}"[:12]
    if "crane" in text:
        return "crane", " up" in f" {text.split('crane', 1)[1]}"[:12]
    if any(w in text for w in ("pull back", "pull-back", "dolly out", "dolly-out", "zoom out")):
        return "push", True
    if any(w in text for w in ("dolly-in", "dolly in", "push-in", "push in", "zoom in")):
        return "push", False
    if any(w in text for w in ("dolly", "sideways", "pan", "track", "slide")):
        return "dolly", "left" in text
    return "push", False


def ease(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def keyframe_rects(size, move, focus, with_model, reverse=False):
    """Start and end crop rectangles (x1, y1, x2, y2) of the still, same 9:16 shape: push-in = full frame to a 1.15x
    crop on the piece; dolly = a sideways slide; tilt = top to bottom; crane = high and wide to low and close."""
    W, H = size
    fx, fy = focus or (W / 2, H / 2)

    def rect(cx, cy, zoom):
        w, h = W / zoom, H / zoom
        x = min(max(cx - w / 2, 0), W - w)
        y = min(max(cy - h / 2, 0), H - h)
        return (x, y, x + w, y + h)

    zoom = 1.08 if with_model else 1.15
    if move == "dolly":
        pair = rect(fx - W * 0.05, fy, 1.12), rect(fx + W * 0.05, fy, 1.12)
    elif move == "tilt":
        pair = rect(fx, fy - H * 0.05, 1.12), rect(fx, fy + H * 0.05, 1.12)
    elif move == "crane":
        pair = rect(fx, fy - H * 0.04, 1.04), rect(fx, fy, zoom + 0.03)
    else:
        pair = (0.0, 0.0, float(W), float(H)), rect(fx, fy, zoom)
    return (pair[1], pair[0]) if reverse else pair


def fetch_image(url, mode="RGB"):
    def get():
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        return r.content
    return ImageOps.exif_transpose(Image.open(io.BytesIO(with_retries("image download", get)))).convert(mode)


def upload_input(image, name):
    buf = io.BytesIO()
    image.save(buf, "PNG", compress_level=1)
    up = requests.post(f"{COMFY}/upload/image", files={"image": (name, buf.getvalue(), "image/png")},
                       data={"type": "input", "overwrite": "true"}, timeout=180)
    up.raise_for_status()
    return up.json()["name"]


def rect_to_h(r, src_offset=(0, 0)):
    """Homography from still pixels (minus src_offset) to frame pixels for a camera looking at crop r."""
    sx, sy = OUT_W / (r[2] - r[0]), OUT_H / (r[3] - r[1])
    ox, oy = src_offset
    return np.array([[sx, 0, (ox - r[0]) * sx], [0, sy, (oy - r[1]) * sy], [0, 0, 1]], dtype=np.float64)


def track_piece(frames, still, box, rects=None):
    """Per frame, the homography from the piece's crop of the still (box = x1, y1, x2, y2 in still pixels) to the
    frame, or None where it was lost. ECC alignment of the still's pixels around the piece (a similarity-like affine,
    frame after frame, each started from the last one moved along the camera path), checked by its correlation and
    a plausible step, then smoothed over 5 frames so the rebuilt piece never jitters against the hand under it."""
    n = len(frames)
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    mx, my = int(bw * 0.35) + 12, int(bh * 0.35) + 12  # context around the piece: the finger moves with it
    tx1, ty1 = max(0, x1 - mx), max(0, y1 - my)
    tx2, ty2 = min(still.width, x2 + mx), min(still.height, y2 + my)
    gray = cv2.cvtColor(np.asarray(still), cv2.COLOR_RGB2GRAY).astype(np.float32)
    template = cv2.GaussianBlur(gray[ty1:ty2, tx1:tx2], (0, 0), 1.0)
    if template.shape[0] < 24 or template.shape[1] < 24 or template.std() < 4:
        return [None] * n
    shift = np.array([[1, 0, tx1], [0, 1, ty1], [0, 0, 1]], dtype=np.float64)  # template -> still pixels
    # ECC costs grow with the template: a big piece (a necklace) is followed at <= 256 px, a ring at full size.
    k = min(1.0, 256.0 / max(template.shape[:2]))
    S, S_inv = np.diag([k, k, 1.0]), np.diag([1 / k, 1 / k, 1.0])
    small = cv2.resize(template, None, fx=k, fy=k, interpolation=cv2.INTER_AREA) if k < 1 else template

    def path(i):
        if rects is None:  # fast render: the clip starts on the whole still
            return np.diag([OUT_W / still.width, OUT_H / still.height, 1.0])
        return rect_to_h(tuple(a + (b - a) * ease(i / max(1, n - 1)) for a, b in zip(*rects)))

    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-4)

    def align(frame_gray, guess):
        # Solved at scale k (template and frame both scaled), returned for full-size pixels.
        warp = (S @ guess @ S_inv)[:2].astype(np.float32)
        try:
            cc, warp = cv2.findTransformECC(small, frame_gray, warp, cv2.MOTION_AFFINE, criteria, None, 5)
        except cv2.error:
            return None, 0.0
        return S_inv @ np.vstack([warp.astype(np.float64), [0, 0, 1]]) @ S, float(cc)

    def plausible(w, ref):
        if w is None or ref is None:
            return w is not None
        s_w, s_r = np.sqrt(abs(np.linalg.det(w[:2, :2]))), np.sqrt(abs(np.linalg.det(ref[:2, :2])))
        centre = np.array([template.shape[1] / 2, template.shape[0] / 2, 1.0])
        step = np.linalg.norm((w @ centre)[:2] - (ref @ centre)[:2])
        return 0.9 < s_w / max(s_r, 1e-6) < 1.11 and step < OUT_W * 0.06

    warps, last = [None] * n, None
    cv2.setNumThreads(CPU_WORKERS)
    try:
        for i in range(n):
            frame_gray = cv2.GaussianBlur(cv2.cvtColor(frames[i], cv2.COLOR_RGB2GRAY).astype(np.float32), (0, 0), 1.0)
            if k < 1:
                frame_gray = cv2.resize(frame_gray, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
            planned = path(i) @ shift
            guesses = ([path(i) @ np.linalg.inv(path(last)) @ warps[last]] if last is not None else []) + [planned]
            for guess in guesses:
                w, cc = align(frame_gray, guess)
                if cc >= 0.8 and plausible(w, warps[last] if last is not None else planned):
                    warps[i], last = w, i
                    break
    finally:
        cv2.setNumThreads(0)
    # Smooth the six affine numbers over runs of tracked frames (centred, 5 frames).
    out = [None] * n
    for i in range(n):
        if warps[i] is None:
            continue
        near = [warps[j] for j in range(max(0, i - 2), min(n, i + 3)) if warps[j] is not None]
        w = np.mean(near, axis=0)
        # crop pixels (the piece's own box) -> template -> frame
        out[i] = w @ np.array([[1, 0, x1 - tx1], [0, 1, y1 - ty1], [0, 0, 1]], dtype=np.float64)
    return out


def steady_exposure(frames):
    """Wan sometimes 'breathes': the whole frame brightens and darkens by 10-20 % over a second or so. Each frame's
    mean brightness is eased onto the clip's own straight-line trend (a deliberate fade or a brighter end frame
    stays), with a tone curve that keeps black and white where they are. Clips that do not pump are left alone."""
    n = len(frames)
    if n < 12:
        return frames
    means = np.array([cv2.resize(cv2.cvtColor(f, cv2.COLOR_RGB2GRAY), (68, 120), interpolation=cv2.INTER_AREA)
                      .mean() for f in frames], dtype=np.float64)
    t = np.arange(n)
    trend = np.polyval(np.polyfit(t, means, 1), t)
    residual = means - trend
    if np.abs(residual).max() < 4.0:  # under ~1.5 %: nothing visible to fix
        return frames
    out = []
    for f, m, target in zip(frames, means, trend):
        m, target = min(max(m, 8.0), 247.0) / 255.0, min(max(target, 8.0), 247.0) / 255.0
        gamma = float(np.clip(np.log(target) / np.log(m), 0.8, 1.25))
        if abs(gamma - 1.0) < 0.004:
            out.append(f)
            continue
        lut = np.clip(((np.arange(256) / 255.0) ** gamma) * 255.0 + 0.5, 0, 255).astype(np.uint8)
        out.append(cv2.LUT(f, lut))
    print(f"exposure steadied: brightness swing {np.ptp(residual):.1f} levels around the trend", flush=True)
    return out


def steady_colour(frames, still):
    """The fast engine sometimes drifts the white balance for a second: a brass thali turned silver and green kundan
    stones blue mid-clip. Each frame's mean colour (CIELAB a* and b*, lightness untouched) is pulled back towards the
    still's wherever it strays by more than 6 units (a camera move that frames more of the piece shifts it a little),
    smoothed over a few frames so the correction itself cannot flicker. Clips that hold their colour are left alone."""
    n = len(frames)
    if n < 12:
        return frames

    def chroma(img):
        small = cv2.resize(img, (68, 120), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
        lab = cv2.cvtColor(small, cv2.COLOR_RGB2LAB)
        return float(lab[..., 1].mean()), float(lab[..., 2].mean())

    ref = np.array(chroma(np.asarray(still.convert("RGB"))))
    drift = np.array([chroma(f) for f in frames]) - ref
    # Clean clips stray up to ~5.5 units on their own (a light sweep, a push-in that frames more gold): left alone.
    excess = np.clip(np.sign(drift) * np.maximum(np.abs(drift) - 6.0, 0.0), -18.0, 18.0)
    if np.abs(excess).max() < 1.0:
        return frames
    k = 4
    padded = np.pad(excess, ((k, k), (0, 0)), mode="edge")
    smooth = np.stack([np.convolve(padded[:, c], np.ones(2 * k + 1) / (2 * k + 1), mode="valid") for c in range(2)], 1)
    out = []
    for f, (da, db) in zip(frames, smooth):
        if abs(da) < 0.5 and abs(db) < 0.5:
            out.append(f)
            continue
        lab = cv2.cvtColor(f.astype(np.float32) / 255.0, cv2.COLOR_RGB2LAB)
        lab[..., 1] -= da
        lab[..., 2] -= db
        out.append((np.clip(cv2.cvtColor(lab, cv2.COLOR_LAB2RGB), 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8))
    print(f"colour steadied: drift up to {np.abs(drift).max():.1f} a*/b* units from the still", flush=True)
    return out


def lock_product(frames, still, mask, rects=None, info=None):
    """The real product, back in every frame: features of the piece in the still are matched in each frame (the camera
    path from the keyframes is the fallback), then restore_product() rebuilds the piece from the still's pixels where
    the frame agrees. Bells, enamel and metal colour can no longer melt or drift. CPU, 3 threads."""
    m = np.asarray(mask, dtype=np.float32) / 255.0
    ys, xs = np.where(m > 0.02)
    if len(xs) < 500:
        return frames, 0
    x1, y1 = max(0, xs.min() - 8), max(0, ys.min() - 8)
    x2, y2 = min(m.shape[1], xs.max() + 9), min(m.shape[0], ys.max() + 9)
    src_rgb = np.ascontiguousarray(np.asarray(still)[y1:y2, x1:x2])
    src_alpha = np.ascontiguousarray(m[y1:y2, x1:x2])
    feats = product_features(src_rgb, src_alpha)
    n = len(frames)
    corners = np.float32([[0, 0], [x2 - x1, 0], [x2 - x1, y2 - y1], [0, y2 - y1]]).reshape(-1, 1, 2)

    def locate(i):
        h, _ = match_product(feats, frames[i], long_side=1100)
        if h is not None and rects is not None:  # without a camera plan (fast render) every match is trusted
            guess = rect_to_h(tuple(a + (b - a) * ease(i / max(1, n - 1)) for a, b in zip(*rects)), (x1, y1))
            drift = np.abs(cv2.perspectiveTransform(corners, h) - cv2.perspectiveTransform(corners, guess)).max()
            if drift > OUT_W * 0.25:  # a match far from where the camera can be: a different part of the frame
                h = None
        return h

    from concurrent.futures import ThreadPoolExecutor
    cv2.setNumThreads(1)  # one OpenCV thread per worker: the frames run side by side on all 4 vCPUs instead
    try:
        with ThreadPoolExecutor(max_workers=CPU_WORKERS) as pool:
            hs = list(pool.map(locate, range(n)))  # same result as one by one, in order
    finally:
        cv2.setNumThreads(0)
    found = [i for i, h in enumerate(hs) if h is not None]
    # Restore only where the frame agrees — except in frames where the piece was tracked pixel for pixel.
    trusted = [False] * n
    if True:
        # A small piece (a ring on a hand is ~60 px wide in the frame) has too few features to match every frame,
        # and its fine texture melts, which the agreement check then keeps: follow it from the still's own pixels
        # around it, seeded by where the camera is; where that holds, the still's piece is used as is.
        tracked = track_piece(frames, still, (x1, y1, x2, y2), rects)
        trusted = [h is not None for h in tracked]
        if any(trusted):
            print(f"piece tracked in {sum(trusted)}/{n} frames (feature matches: {len(found)})", flush=True)
            hs = [t if t is not None else h for t, h in zip(tracked, hs)]
            found = [i for i, h in enumerate(hs) if h is not None]
    if not found:
        return frames, 0
    for i in range(n):  # gaps: the nearest found frame's geometry, shifted along the planned camera path
        if hs[i] is None:
            j = min(found, key=lambda k: abs(k - i))
            if rects is None:  # no planned path to shift along: only a neighbour 1-2 frames away is close enough
                if abs(j - i) <= 2:
                    hs[i] = hs[j]
            elif abs(j - i) <= 6:
                path = lambda k: rect_to_h(tuple(a + (b - a) * ease(k / max(1, n - 1)) for a, b in zip(*rects)))
                hs[i] = path(i) @ np.linalg.inv(path(j)) @ hs[j]
    cv2.setNumThreads(1)

    def one(i):
        if hs[i] is None:
            return None
        out, _, _ = restore_product(frames[i], src_rgb, src_alpha, hs[i], min_coverage=0.3, trust=trusted[i])
        return out

    try:
        with ThreadPoolExecutor(max_workers=CPU_WORKERS) as pool:
            restored = list(pool.map(one, range(n)))
    finally:
        cv2.setNumThreads(0)
    # Where the piece could not be rebuilt it would snap between the photo's pixels and the generated ones; instead
    # the rebuild fades out over LOCK_RAMP frames towards every such frame and back in after it.
    gaps = [i for i, r in enumerate(restored) if r is None]
    out = []
    for i in range(n):
        if restored[i] is None:
            out.append(frames[i])
            continue
        w = min(1.0, min((abs(i - j) for j in gaps), default=LOCK_RAMP) / LOCK_RAMP)
        out.append(restored[i] if w >= 1 else cv2.addWeighted(restored[i], w, frames[i], 1 - w, 0))
    if info is not None:  # where the real piece is in each frame: add_glints() and piece_drift() follow it
        info.update(hs=hs, restored=[r is not None for r in restored], src_rgb=src_rgb, src_alpha=src_alpha,
                    box=(x1, y1, x2, y2))
    return out, n - len(gaps)


GLINTS = 3  # twinkles per clip, each on a different highlight of the real piece


def glint_points(src_rgb, src_alpha, count=GLINTS):
    """The piece's own specular highlights (crop pixels of the still): small spots that are very bright AND stand out
    from their surroundings (a polished edge, a stone's facet), spread over the piece."""
    a = src_alpha > 0.6
    if a.sum() < 400:
        return []
    lum = cv2.cvtColor(np.ascontiguousarray(src_rgb), cv2.COLOR_RGB2GRAY).astype(np.float32)
    size = float(np.sqrt(a.sum()))
    k = max(3, int(size / 25) | 1)
    tophat = cv2.morphologyEx(lum, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3 * k, 3 * k)))
    score = (0.6 * tophat + 0.4 * lum) * a
    threshold = np.percentile(score[a], 99.0)
    work, points, spacing = score.copy(), [], size * 0.25
    for _ in range(60):
        y, x = np.unravel_index(int(np.argmax(work)), work.shape)
        if work[y, x] <= 0 or work[y, x] < threshold or lum[y, x] < 170:
            break
        if all((x - px) ** 2 + (y - py) ** 2 >= spacing ** 2 for px, py in points):
            points.append((float(x), float(y)))
            if len(points) >= count:
                break
        cv2.circle(work, (int(x), int(y)), int(max(2, spacing / 2)), 0, -1)
    return points


def star_sprite(radius):
    """A soft four-point star like a camera's specular glint: two thin bright rays, two fainter diagonals, a core."""
    r = max(6, int(radius))
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float32)
    d = np.sqrt(xx ** 2 + yy ** 2) / r
    w = max(0.8, r * 0.035)

    def ray(u, v, width):
        return np.exp(-(v / width) ** 2) * np.clip(1 - np.abs(u) / r, 0, 1) ** 2.2

    diag1, diag2 = (xx + yy) / np.sqrt(2), (xx - yy) / np.sqrt(2)
    star = ray(xx, yy, w) + ray(yy, xx, w)
    star += 0.35 * (ray(diag1, diag2, 0.8 * w) + ray(diag2, diag1, 0.8 * w)) * np.clip(1 - 1.4 * d, 0, 1)
    star += 0.9 * np.exp(-(4.0 * d) ** 2)
    return np.clip(star, 0, 1)


def add_glints(frames, info):
    """Real glints instead of AI sparkle: a few short twinkles on the piece's own brightest highlights, carried along
    with the locked piece (its per-frame position from lock_product) and only on frames where it is locked. Screen
    blend, tinted by the highlight's own colour, at the size of the piece."""
    if not info or not info.get("hs"):
        return frames
    n = len(frames)
    points = glint_points(info["src_rgb"], info["src_alpha"])
    if not points or n < 30:
        return frames
    hs, restored, src = info["hs"], info["restored"], info["src_rgb"]
    piece = float(np.sqrt((info["src_alpha"] > 0.5).sum()))
    dur = max(10, int(n * 0.11))
    out = list(frames)
    for (px, py), at in zip(points, (0.3, 0.56, 0.8)):
        centre = int(n * at)
        colour = src[int(py), int(px)].astype(np.float32) / 255.0
        tint = 0.78 + 0.22 * colour / max(1e-3, float(colour.max()))  # mostly white, a hint of the metal's colour
        for i in range(max(0, centre - dur // 2), min(n, centre + dur // 2 + 1)):
            if hs[i] is None or not restored[i]:
                continue
            env = float(np.sin(np.pi * (i - (centre - dur // 2)) / dur) ** 2)
            if env < 0.03:
                continue
            H = hs[i]
            p = H @ np.array([px, py, 1.0])
            fx, fy = p[0] / p[2], p[1] / p[2]
            scale = float(np.sqrt(abs(np.linalg.det(H[:2, :2] / H[2, 2]))))
            sprite = star_sprite(np.clip(0.14 * piece * scale, 10, 80) * (0.6 + 0.4 * env)) * (0.9 * env)
            r = sprite.shape[0] // 2
            x1, y1, x2, y2 = int(round(fx)) - r, int(round(fy)) - r, int(round(fx)) + r + 1, int(round(fy)) + r + 1
            fh, fw = out[i].shape[:2]
            cx1, cy1, cx2, cy2 = max(0, x1), max(0, y1), min(fw, x2), min(fh, y2)
            if cx2 <= cx1 or cy2 <= cy1:
                continue
            if out[i] is frames[i]:
                out[i] = frames[i].copy()
            glow = sprite[cy1 - y1:cy2 - y1, cx1 - x1:cx2 - x1, None] * tint[None, None, :]
            region = out[i][cy1:cy2, cx1:cx2].astype(np.float32) / 255.0
            out[i][cy1:cy2, cx1:cx2] = (np.clip(1 - (1 - region) * (1 - glow), 0, 1) * 255 + 0.5).astype(np.uint8)
    return out


GRADE = {}


def grade_frames(frames):
    """A light premium grade, the same on every frame (no flicker): a gentle S-curve for depth (equal on R, G and B,
    so gold and silver keep their hue) and a barely visible vignette that keeps the eye on the centre."""
    if not frames:
        return frames
    h, w = frames[0].shape[:2]
    if (h, w) not in GRADE:
        x = np.arange(256, dtype=np.float32) / 255.0
        curve = x + 0.04 * np.sin(2 * np.pi * (x - 0.5)) * (0.5 - np.abs(x - 0.5)) * 2  # +/- ~5 levels, ends fixed
        lut = np.clip(curve * 255 + 0.5, 0, 255).astype(np.uint8)
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        dist = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / np.sqrt(2)
        vignette = 1 - 0.1 * np.clip((dist - 0.45) / 0.55, 0, 1) ** 2
        # 8-bit gain (255 = unchanged) so OpenCV applies it with SIMD: ~10x faster than float frames.
        GRADE[(h, w)] = (lut, cv2.merge([np.round(vignette * 255).astype(np.uint8)] * 3))
    lut, vignette = GRADE[(h, w)]
    return [cv2.multiply(cv2.LUT(f, lut), vignette, scale=1 / 255.0) for f in frames]


def encode_frames(frames, fps_in, dst, polish=False):
    """One lossy encode per clip: raw RGB frames -> 1080x1920 30 fps H.264 (CRF 16, preset slow), silent AAC. The
    RGB -> YUV conversion is BT.709 and tagged so (untagged, phones and Instagram read the colours with the wrong
    matrix and gold shifts hue). polish (scene clips): a short deflicker (steps in brightness from Wan's tiled decode),
    a light luma-only adaptive sharpen of the 2x upscale and a very fine luma grain, when this ffmpeg has the filters."""
    # RIFE's 32 fps frames are played at 30 fps (5.4 s, a touch slower — every frame kept, no judder); Wan's own
    # 16 fps is blended up to 30 fps; anything else is resampled.
    if 28 <= fps_in <= 34:
        rate, convert = OUT_FPS, ""
    elif fps_in < 24 and has_filter("framerate"):
        rate, convert = fps_in, f"framerate=fps={OUT_FPS},"
    else:
        rate, convert = fps_in, f"fps={OUT_FPS},"
    finish = ""
    if polish and has_filter("deflicker"):
        finish += "deflicker=size=5:mode=pm,"
    if polish and has_filter("cas"):
        finish += "cas=strength=0.3:planes=1,"
    if polish and has_filter("noise"):
        finish += "noise=c0s=3:c0f=t,"  # very fine luma-only grain: breaks up banding in dark backdrops
    cmd = [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OUT_W}x{OUT_H}",
           "-r", str(rate), "-i", "-", "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
           "-map", "0:v:0", "-map", "1:a:0", "-shortest",
           "-vf", convert + "scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,"
                  "format=yuv420p," + finish + "setsar=1",
           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-level", "4.2",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
           "-threads", "3", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", dst]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for frame in frames:
        proc.stdin.write(np.ascontiguousarray(frame, dtype=np.uint8).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg could not encode the clip")


def render_logo_clip(clip, dst):
    """The brand logo, animated on the CPU (no video model, so the typeset name stays spelled exactly): a fade in,
    a slow 5% zoom and a light sweep across the gold lettering and emblem."""
    logo = np.asarray(ImageOps.fit(fetch_image(clip["imageUrl"]), (OUT_W, OUT_H), Image.Resampling.LANCZOS),
                      dtype=np.float32) / 255.0
    lum = logo @ np.float32([0.299, 0.587, 0.114])
    shine = np.clip((lum - 0.35) / 0.4, 0, 1)[..., None]
    yy, xx = np.mgrid[0:OUT_H, 0:OUT_W].astype(np.float32)
    diag = (xx / OUT_W + 0.45 * yy / OUT_H) / 1.45
    seconds, frames = 5.0, []
    for i in range(int(seconds * OUT_FPS)):
        t = i / OUT_FPS
        z = 1.0 + 0.05 * ease(t / seconds)
        m = cv2.getRotationMatrix2D((OUT_W / 2, OUT_H / 2), 0, z)
        base = cv2.warpAffine(logo, m, (OUT_W, OUT_H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        glow = cv2.warpAffine(shine, m, (OUT_W, OUT_H), flags=cv2.INTER_LINEAR)[..., None]
        pos = -0.2 + 1.4 * ease((t - 0.6) / 2.2)
        band = np.exp(-((diag - pos) / 0.05) ** 2)[..., None]
        frame = base + glow * band * np.float32([0.55, 0.48, 0.32])
        frame *= min(1.0, t / 0.5)
        frames.append((np.clip(frame, 0, 1) * 255 + 0.5).astype(np.uint8))
    encode_frames(frames, OUT_FPS, dst)


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
    decoded = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-map", "0:v:0", "-f", "null", "-"],
                             capture_output=True, text=True)
    if decoded.returncode != 0 or decoded.stderr.strip():
        raise RuntimeError("The encoded clip does not decode cleanly: " + decoded.stderr.strip()[-300:])
    return {"width": int(video_w), "height": int(video_h), "fps": float(video_fps), "duration": duration, "size": size}


def video_duration(path):
    out = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\\d+):(\\d+):([\\d.]+)", out)
    if not m:
        raise RuntimeError(f"Could not read duration of {path}")
    h, mnt, s = m.groups()
    return int(h) * 3600 + int(mnt) * 60 + float(s)


FILTERS = {}


def has_filter(name):
    if FFMPEG not in FILTERS:
        FILTERS[FFMPEG] = subprocess.run([FFMPEG, "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return re.search(rf"\\s{name}\\s", FILTERS[FFMPEG]) is not None


def frame_stats(frames):
    """Per-frame brightness (mean, spread) and the mean change from the previous frame, on 1/8-size grey copies."""
    small = [cv2.cvtColor(cv2.resize(f, (OUT_W // 8, OUT_H // 8), interpolation=cv2.INTER_AREA),
                          cv2.COLOR_RGB2GRAY).astype(np.float32) for f in frames]
    means = np.array([s.mean() for s in small], dtype=np.float32)
    spreads = np.array([s.std() for s in small], dtype=np.float32)
    diffs = np.array([np.abs(a - b).mean() for a, b in zip(small[1:], small[:-1])], dtype=np.float32)
    return means, spreads, diffs


def scene_motion(frames, box):
    """Per frame, the similarity taking frame 0 to that frame for the scene around the piece (the camera's own move):
    ORB + RANSAC on quarter-size frames with the piece masked out, kept only when plausible for a slow camera move;
    otherwise the last good one (a plain backdrop has nothing to follow — and then the camera barely matters)."""
    s = 0.25
    small = lambda f: cv2.resize(cv2.cvtColor(f, cv2.COLOR_RGB2GRAY), None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    g0 = small(frames[0])
    mask = np.full(g0.shape, 255, np.uint8)
    x1, y1, x2, y2 = [int(v * s) for v in box]
    pad = int(0.15 * max(x2 - x1, y2 - y1))
    mask[max(0, y1 - pad):y2 + pad, max(0, x1 - pad):x2 + pad] = 0
    orb = cv2.ORB_create(800, fastThreshold=10)
    k0, d0 = orb.detectAndCompute(g0, mask)
    S, S_inv = np.diag([s, s, 1.0]), np.diag([1 / s, 1 / s, 1.0])
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    warps, last = [np.eye(3)], np.eye(3)
    for f in frames[1:]:
        found = None
        if d0 is not None and len(k0) >= 25:
            k1, d1 = orb.detectAndCompute(small(f), mask)
            if d1 is not None and len(k1) >= 25:
                m = matcher.match(d0, d1)
                if len(m) >= 20:
                    a = np.float32([k0[x.queryIdx].pt for x in m])
                    b = np.float32([k1[x.trainIdx].pt for x in m])
                    A, inliers = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=2.0)
                    if A is not None and inliers is not None and inliers.sum() >= 15:
                        scale = float(np.sqrt(abs(np.linalg.det(A[:, :2]))))
                        if 0.85 < scale < 1.2 and np.hypot(A[0, 2], A[1, 2]) < 0.25 * g0.shape[1]:
                            found = S_inv @ np.vstack([A, [0, 0, 1]]) @ S
        last = found if found is not None else last
        warps.append(last)
    return warps


def piece_drift(frames, info, rects=None):
    """How far the locked piece moved against where the camera alone would put it, as a share of the frame width,
    held for PIECE_DRIFT_FRAMES frames in a row (0 = it only moved with the camera). The camera is the planned path
    (first-last-frame render) or, without one (fast render), the scene's own measured motion."""
    hs = (info or {}).get("hs")
    if not hs or "box" not in info:
        return 0.0
    n = len(hs)
    x1, y1, x2, y2 = info["box"]
    centre = np.array([(x2 - x1) / 2.0, (y2 - y1) / 2.0, 1.0])  # crop pixels
    found = [i for i, h in enumerate(hs) if h is not None]
    if len(found) < PIECE_DRIFT_FRAMES:
        return 0.0
    if rects is not None:
        def expected(i):
            path = rect_to_h(tuple(a + (b - a) * ease(i / max(1, n - 1)) for a, b in zip(*rects)))
            p = path @ np.array([x1 + centre[0], y1 + centre[1], 1.0])
            return p[:2] / p[2]
    else:
        h0 = hs[found[0]]
        corners = np.float32([[0, 0], [x2 - x1, 0], [x2 - x1, y2 - y1], [0, y2 - y1]]).reshape(-1, 1, 2)
        bx = cv2.perspectiveTransform(corners, h0).reshape(-1, 2)
        bx1, by1 = bx.min(0)
        bx2, by2 = bx.max(0)
        camera = scene_motion(frames, (max(0, bx1), max(0, by1), bx2, by2))
        p0 = h0 @ centre
        p0 = p0 / p0[2]
        start = np.linalg.inv(camera[found[0]])

        def expected(i):
            p = camera[i] @ start @ p0
            return p[:2] / p[2]

    drift = np.full(n, np.nan)
    for i in found:
        p = hs[i] @ centre
        drift[i] = float(np.linalg.norm(p[:2] / p[2] - expected(i))) / OUT_W
    held = 0.0
    for i in range(n - PIECE_DRIFT_FRAMES + 1):
        window = drift[i:i + PIECE_DRIFT_FRAMES]
        if not np.isnan(window).any():
            held = max(held, float(window.min()))
    return held


PIECE_COLOUR_SHIFT = 0.12  # share of the locked piece whose colour left the still's, held for PIECE_DRIFT_FRAMES


def piece_colour_shift(frames, info):
    """How much of the locked piece changed colour against the still (each frame warped back onto the still's piece by
    its tracked homography; CIELAB a*/b* difference over 18), held for PIECE_DRIFT_FRAMES frames in a row. A fast
    render turned green kundan stones blue for two seconds (0.38); clean clips read 0.00-0.01."""
    hs = (info or {}).get("hs")
    if not hs or info.get("src_rgb") is None:
        return 0.0
    src, a = info["src_rgb"], info["src_alpha"]
    ch, cw = a.shape
    small = (max(8, int(cw / max(1.0, cw / 96.0))), max(8, int(ch / max(1.0, cw / 96.0))))
    ref = cv2.cvtColor(cv2.resize(src, small, interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0,
                       cv2.COLOR_RGB2LAB)
    w = cv2.resize(a, small, interpolation=cv2.INTER_AREA) > 0.6
    if w.sum() < 20:
        return 0.0
    shares = np.full(len(frames), np.nan)
    for i, (f, h) in enumerate(zip(frames, hs)):
        if h is None:
            continue
        back = cv2.warpPerspective(f, np.linalg.inv(h), (cw, ch), flags=cv2.INTER_AREA)
        lab = cv2.cvtColor(cv2.resize(back, small, interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0,
                           cv2.COLOR_RGB2LAB)
        dab = cv2.GaussianBlur(np.hypot(lab[..., 1] - ref[..., 1], lab[..., 2] - ref[..., 2]), (0, 0), 1.0)
        shares[i] = float((dab[w] > 18).mean())
    held = 0.0
    for i in range(len(shares) - PIECE_DRIFT_FRAMES + 1):
        window = shares[i:i + PIECE_DRIFT_FRAMES]
        if not np.isnan(window).any():
            held = max(held, float(window.min()))
    return held


def longest_gap(flags):
    """Longest run of False in a list of per-frame flags."""
    best = run = 0
    for flag in flags:
        run = 0 if flag else run + 1
        best = max(best, run)
    return best


def clip_qa(frames, expected, locked=None, drift=None, drift_limit=PIECE_DRIFT_MAX, gap=None,
            gap_limit=PIECE_GAP_FRAMES, colour_shift=None):
    """What is visibly wrong with a take, as (score, problems); 0 = clean, lower is better. Broken frames (black, blown
    out or blank: fp16 NaNs) are fatal (score >= 1000). A sudden jump (one frame change far above the clip's own
    motion: a cut or a morph), brightness flicker, and a real piece found in too few frames (it drifted, melted or
    was covered) are defects worth a re-render with a new seed."""
    if len(frames) < expected * 0.9:
        return 1000.0, [f"only {len(frames)} of {expected} frames"]
    means, spreads, diffs = frame_stats(frames)
    problems, score = [], 0.0
    broken = int(((means < 8) | (means > 247) | (spreads < 2)).sum())
    if broken:
        problems.append(f"{broken} broken frame(s)")
        score += 1000 + broken
    if len(diffs) > 4:
        jumps = int((diffs > max(QA_JUMP_MIN, QA_JUMP_RATIO * float(np.median(diffs)))).sum())
        if jumps:
            problems.append(f"{jumps} sudden jump(s)")
            score += 10 * jumps
        wobble = float(np.abs(np.diff(means, 2)).max())
        if wobble > QA_FLICKER:
            problems.append(f"brightness flicker ({wobble:.1f})")
            score += 5
    if locked is not None and len(frames):
        rate = locked / len(frames)
        if rate < QA_MIN_LOCKED:
            problems.append(f"real piece matched in only {rate:.0%} of frames")
            score += 8 * (1 + QA_MIN_LOCKED - rate)
    if drift is not None and drift > drift_limit:
        problems.append(f"the piece moves on its own ({drift:.1%} of the frame) — something pushed or picked it up")
        score += 10
    if gap is not None and locked and gap >= gap_limit:
        problems.append(f"the piece is hidden or gone for {gap} frames in a row")
        score += 8
    if colour_shift is not None and colour_shift > PIECE_COLOUR_SHIFT:
        problems.append(f"the piece's colours change ({colour_shift:.0%} of it)")
        score += 10
    return score, problems


# What a take is rejected for when the piece itself was lost: it slid away, left the frame or was covered.
PIECE_LOST = ("moves on its own", "hidden or gone", "matched in only", "colours change")


def still_motion(still, mask, count):
    """A camera-only clip from the approved still: a slow, eased push-in to 108 % towards the piece. Delivered when
    every rendered take lost the piece (a fast-engine tilt that left the payals out of frame, a hand that covered
    them) — the jeweller's own still, moving smoothly, beats a clip whose piece slides away or disappears."""
    img = np.asarray(still.convert("RGB"))
    h, w = img.shape[:2]
    cx, cy = w / 2, h / 2
    if mask is not None:
        ys, xs = np.where(np.asarray(mask) > 128)
        if len(xs):
            cx, cy = float(xs.mean()), float(ys.mean())
    frames = []
    for i in range(count):
        t = i / max(1, count - 1)
        z = 1.0 + 0.08 * t * t * (3 - 2 * t)  # eased in and out
        m = np.float32([[z, 0, (1 - z) * cx], [0, z, (1 - z) * cy]])
        frames.append(cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT))
    return frames


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


def upload_clip(path, url):
    def put():
        with open(path, "rb") as fh:
            requests.put(url, data=fh, headers={"Content-Type": "video/mp4"}, timeout=600).raise_for_status()
    with_retries("clip upload", put, attempts=5)


def run_prompt(engine, workflow, on_step=None, on_wait=None):
    """Runs one graph on one ComfyUI and follows it over its WebSocket until it finishes; returns its history item.
    Errors, and that ComfyUI dying, raise."""
    client_id = uuid.uuid4().hex
    cws = websocket.create_connection(f"ws://127.0.0.1:{engine['port']}/ws?clientId={client_id}", timeout=30)
    try:
        r = requests.post(f"{engine['url']}/prompt", timeout=180, json={"prompt": workflow, "client_id": client_id})
        if not r.ok:
            raise RuntimeError("ComfyUI rejected the workflow: " + r.text[:1500])
        pid = r.json()["prompt_id"]
        t0 = time.time()
        cws.settimeout(600)
        while True:  # ComfyUI WebSocket events instead of polling /history
            if time.time() - t0 > 3 * 3600:
                raise TimeoutError("Rendering took longer than 3 hours")
            try:
                msg = cws.recv()
            except websocket.WebSocketTimeoutException:
                # Long silent steps (model load, VAE decode): ask ComfyUI directly instead of failing the clip.
                if not engine_alive(engine):
                    raise ConnectionError("ComfyUI stopped while rendering")
                hist = requests.get(f"{engine['url']}/history/{pid}", timeout=60).json().get(pid, {})
                if hist.get("status", {}).get("completed") or hist.get("outputs"):
                    break
                if hist.get("status", {}).get("status_str") == "error":
                    raise RuntimeError("ComfyUI reported an error: " + json.dumps(hist.get("status"))[:800])
                if on_wait:
                    on_wait()
                continue
            if not isinstance(msg, str):
                continue
            evt = json.loads(msg)
            kind, data = evt.get("type"), evt.get("data", {})
            if data.get("prompt_id") not in (None, pid):
                continue
            if kind == "progress" and data.get("max") and on_step:
                on_step(data["value"], data["max"])
            elif kind == "execution_error":
                raise RuntimeError(f"{data.get('node_type')}: {data.get('exception_message')}")
            elif kind == "execution_success" or (kind == "executing" and data.get("node") is None):
                break
        return requests.get(f"{engine['url']}/history/{pid}", timeout=60).json().get(pid, {})
    finally:
        try:
            cws.close()
        except Exception:
            pass


def frame_files(item):
    files = []
    for out in item.get("outputs", {}).values():
        for f in out.get("images") or []:
            files.append(os.path.join(COMFY_DIR, f.get("type") or "output", f.get("subfolder", ""), f["filename"]))
    return sorted(set(files))


def load_frames(files):
    """The saved frames at 1080x1920; the PNGs are deleted. OpenCV decodes and resizes without holding the GIL, so
    all frames load side by side."""
    def load(f):
        return cv2.resize(cv2.cvtColor(cv2.imread(f, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB), (OUT_W, OUT_H),
                          interpolation=cv2.INTER_LANCZOS4)
    from concurrent.futures import ThreadPoolExecutor
    try:
        with ThreadPoolExecutor(max_workers=CPU_WORKERS) as pool:
            return list(pool.map(load, files))
    finally:
        for f in files:
            try:
                os.remove(f)
            except OSError:
                pass


def remove_prefix(prefix):
    for f in glob.glob(os.path.join(COMFY_DIR, "output", prefix + "*")):
        try:
            os.remove(f)
        except OSError:
            pass


class ClipWork:
    """One clip moving through the pipeline: GPU 0 stage, GPU 1 stage (split), CPU finish."""

    def __init__(self, spec, n, count, p):
        self.spec, self.key, self.n, self.count = spec, spec["key"], n, count
        self.label = "logo" if self.key == "logo" else f"scene {int(self.key.split('-')[-1]) + 1}"
        self.p = dict(p)
        self.rung = next((i for i, (w, h) in enumerate(SIZE_LADDER) if w <= p["width"] and h <= p["height"]), 0)
        self.attempt, self.restarts, self.best, self.prep = 0, set(), None, None
        self.share, self.started, self.take_started = 0.0, None, None
        self.seed, self.handoff, self.prefix, self.files, self.fps = None, None, None, [], WAN_FPS

    def size(self):
        width, height = SIZE_LADDER[self.rung]
        return dict(self.p, width=width, height=height)


def prepare_clip(work):
    """Once per clip: the still, its product mask and the keyframe crops; the keyframes are uploaded per size."""
    if work.prep is None:
        clip = work.spec
        still = ImageOps.fit(fetch_image(clip["imageUrl"]), (OUT_W, OUT_H), Image.Resampling.LANCZOS)  # never blur-pad
        mask = None
        if clip.get("maskUrl"):
            try:
                mask = ImageOps.fit(fetch_image(clip["maskUrl"], "L"), (OUT_W, OUT_H), Image.Resampling.BILINEAR)
            except Exception as exc:
                print("no product mask for this scene (the frames keep the generated pixels):", exc, flush=True)
        if mask is not None and int((np.asarray(mask) > 5).sum()) < 500:
            # The image worker uploads an empty mask when the still has no real product pixels (a redrawn shot):
            # nothing to lock, so the quality gate must not demand a lock (it would force a hopeless retake).
            print("the product mask of this scene is empty: no product lock for it", flush=True)
            mask = None
        focus = None
        if mask is not None:
            ys, xs = np.where(np.asarray(mask) > 128)
            if len(xs):
                focus = (float(xs.mean()), float(ys.mean()))
        with_model = bool(re.search(r"\\b(model|person|woman|man|wearing|worn)\\b", clip["prompt"], re.I))
        move, reverse = camera_move(clip["prompt"])
        if globals().get("FAST_VIDEO"):  # TI2V-5B starts from the whole still; the prompt alone moves the camera
            full = (0.0, 0.0, float(still.width), float(still.height))
            work.prep = {"still": still, "mask": mask, "rects": (full, full), "lock_rects": None, "inputs": {},
                         "with_model": with_model}
        else:
            rects = keyframe_rects(still.size, move, focus, with_model, reverse)
            work.prep = {"still": still, "mask": mask, "rects": rects, "lock_rects": rects, "inputs": {},
                         "with_model": with_model}
    p = work.size()
    size = (p["width"], p["height"])
    if size not in work.prep["inputs"]:
        tag = uuid.uuid4().hex[:6]
        work.prep["inputs"][size] = [upload_input(work.prep["still"].crop(tuple(int(round(v)) for v in r)).resize(
            size, Image.Resampling.LANCZOS), f"{work.key}_{tag}_{n}.png")
            for n, r in (("first", work.prep["rects"][0]), ("last", work.prep["rects"][1]))]
    return work.prep["inputs"][size]


def stage_gpu0(work, progress):
    """GPU 0: the high-noise pass (split), or the whole clip on one ComfyUI."""
    p = work.size()
    names = prepare_clip(work)
    fixed = int(work.spec.get("seed", -1))
    work.seed = fixed if work.attempt == 0 and fixed >= 0 else random.randrange(2**63 - 1)
    work.take_started = time.time()
    work.prefix = f"reel/{JOB['jobId'][:8]}_{work.key}_{uuid.uuid4().hex[:6]}_t{work.attempt}"
    take = " · new take" if work.attempt else ""
    if SPLIT:
        work.handoff = os.path.join(HANDOFF_DIR, f"{work.key}_{uuid.uuid4().hex[:8]}.pt")
        graph, _ = make_workflow(work.spec["prompt"], work.seed, p, names[0], names[1], None, "a", work.handoff,
                                 negative=work.spec.get("negative"))
        run_prompt(ENGINES["a"], graph,
                   lambda v, m: progress(work, 0.05 + 0.35 * v / m, f"Rendering {work.label}{take} · motion pass "
                                                                     f"step {v}/{m}"),
                   lambda: progress(work, 0.05, f"Rendering {work.label}{take} · still working", True))
        if not os.path.exists(work.handoff):
            raise RuntimeError("the high-noise pass saved no hand-off")
        return
    graph, work.fps = make_workflow(work.spec["prompt"], work.seed, p, names[0], names[1], work.prefix,
                                    negative=work.spec.get("negative"))
    try:
        item = run_prompt(ENGINES["a"], graph,
                          lambda v, m: progress(work, 0.05 + 0.7 * v / m, f"Rendering {work.label}{take} · step "
                                                                            f"{v}/{m}"),
                          lambda: progress(work, 0.05, f"Rendering {work.label}{take} · still working", True))
        work.files = frame_files(item)
    except Exception:
        remove_prefix(work.prefix)
        raise


def stage_gpu1(work, progress):
    """GPU 1 (split): the low-noise pass from the hand-off, the VAE decode and the RIFE interpolation."""
    p = work.size()
    graph, work.fps = make_workflow(None, work.seed, p, None, None, work.prefix, "b", work.handoff)
    try:
        item = run_prompt(ENGINES["b"], graph,
                          lambda v, m: progress(work, 0.4 + 0.35 * v / m, f"Rendering {work.label} · detail pass "
                                                                           f"step {v}/{m}"),
                          lambda: progress(work, 0.4, f"Rendering {work.label} · still working", True))
        work.files = frame_files(item)
    except Exception:
        remove_prefix(work.prefix)
        raise
    finally:
        try:
            os.remove(work.handoff)
        except OSError:
            pass


def stage_cpu(work, progress):
    """CPU: frames loaded, the real product locked in, the quality gate. Returns "retake" (the take failed the gate
    and the session has time for another), or encodes, checks and uploads the better take and returns "done"."""
    reel = os.path.join(OUT_DIR, f"{work.key}.mp4")
    if work.key == "logo":
        progress(work, 0.1, f"Animating the {work.label}", True)
        render_logo_clip(work.spec, reel)
        notes, seed = [], None
    else:
        frames = load_frames(work.files)
        work.files = []
        if len(frames) < 20:
            raise RuntimeError(f"Only {len(frames)} frames were produced for {work.key}")
        frames = steady_exposure(frames)
        frames = steady_colour(frames, work.prep["still"])
        prep, locked, drift, gap, shift = work.prep, None, None, None, None
        if prep["mask"] is not None:
            progress(work, 0.8, f"Locking the real product into {work.label}", True)
            t_lock = time.time()
            lock_info = {}
            frames, locked = lock_product(frames, prep["still"], prep["mask"], prep["lock_rects"], lock_info)
            print(f"{work.label}: real product locked in {locked}/{len(frames)} frames ({time.time() - t_lock:.0f}s)",
                  flush=True)
            drift = piece_drift(frames, lock_info, prep["lock_rects"])
            gap = longest_gap(lock_info.get("restored") or []) if lock_info.get("hs") else None
            shift = piece_colour_shift(frames, lock_info)
            frames = add_glints(frames, lock_info)  # real glints on the locked piece's own highlights
            del lock_info
        # A worn piece may move a little with the model (a breath, a hand settling); a piece on a surface may not.
        relaxed = 2.5 if prep.get("with_model") else 1.0
        score, problems = clip_qa(frames, work.p["frames"], locked, drift, PIECE_DRIFT_MAX * relaxed, gap,
                                  int(PIECE_GAP_FRAMES * relaxed), shift)
        print(f"{work.label} take {work.attempt + 1} (seed {work.seed}): quality score {score:.1f}",
              "; ".join(problems) or "clean", flush=True)
        if work.best is None or score < work.best["score"]:
            work.best = {"score": score, "problems": problems, "frames": frames, "fps": work.fps, "locked": locked,
                         "seed": work.seed}
        del frames
        if score > 0 and work.attempt < QA_RETRIES:
            left = globals().get("time_left")
            if left is None or left() >= (time.time() - work.take_started) * 1.2 + 300:
                progress(work, 0.05, f"Quality check on {work.label}: {', '.join(problems)} — rendering a new take",
                         True)
                return "retake"
            print(f"{work.label}: no session time for another take; keeping the best one", flush=True)
        best, work.best = work.best, None
        if best["score"] >= 1000:
            raise RuntimeError(f"{work.label.capitalize()} failed the quality check: " + ", ".join(best["problems"]))
        frames, locked = best.pop("frames"), best["locked"]
        notes, seed = best["problems"], best["seed"]
        if best["score"] > 0 and any(k in note for note in notes for k in PIECE_LOST):
            print(f"{work.label}: every take lost the piece ({'; '.join(notes)}) — delivering a camera move over the "
                  "approved still instead", flush=True)
            frames = still_motion(prep["still"], prep["mask"], len(frames))
            if prep["mask"] is not None:
                lock_info = {}
                frames, locked = lock_product(frames, prep["still"], prep["mask"], None, lock_info)
                frames = add_glints(frames, lock_info)
                del lock_info
            notes, seed = ["every rendered take lost the piece: this clip moves the camera over the still"], None
        progress(work, 0.9, f"Encoding {work.label}" +
                 (f" · real product in {locked}/{len(frames)} frames" if locked is not None else ""), True)
        encode_frames(grade_frames(frames), best["fps"], reel, polish=True)
        del frames
    # A mostly dark animated logo compresses to a few hundred KB; a scene clip that small means a broken render.
    validate_render(reel, OUT_W, OUT_H, OUT_FPS, min_duration=4.5, min_bytes=30_000 if work.key == "logo" else 500_000)
    upload_clip(reel, work.spec["uploadUrl"])
    progress(work, 1.0, f"{work.label.capitalize()} ready", True, stage="clipDone",
             seed=None if seed is None else str(seed), qualityNotes=[n[:120] for n in notes[:8]])
    return "done"


def release_clip(work):
    """Everything a finished (or failed) clip left behind: keyframe inputs, a hand-off, frames, the held best take."""
    for names in ((work.prep or {}).get("inputs") or {}).values():
        for name in names:
            try:
                os.remove(os.path.join(COMFY_DIR, "input", name))
            except OSError:
                pass
    if work.handoff:
        try:
            os.remove(work.handoff)
        except OSError:
            pass
    for f in work.files:
        try:
            os.remove(f)
        except OSError:
            pass
    work.files, work.best, work.prep = [], None, None
`;

export const CELL_RUN = `
class SessionHandover(Exception):
    """Raised when the next step would not finish inside this Kaggle session."""


def time_left():
    return JOB.get("sessionBudgetSeconds", 11 * 3600) - (time.time() - SESSION_START)


def handover(progress, what):
    report.send("sessionExpiring", progress, f"Kaggle session time almost up before {what} — continuing in a new session",
                force=True)
    raise SessionHandover(what)


def run():
    """The clips as a pipeline over both GPUs and the CPU. Split: GPU 0 runs clip N+1's high-noise pass while GPU 1
    runs clip N's low-noise pass, decode and RIFE, and the CPU locks the product into, checks and encodes the clip
    before. Not split: one ComfyUI renders the clips one after another while the CPU finishes the previous one.
    Every clip gets exactly the graph, steps and checks it would get on its own."""
    import queue as _queue
    import itertools
    specs = JOB.get("clips") or []
    if not specs:  # a restarted job whose clips were all delivered: no engine was started, nothing left to render
        report.send("completed", 100, "Done (nothing left to render)", status="completed", force=True, failedClips=[])
        return
    split = bool(globals().get("SPLIT"))  # set by the engine cell; read once so every stage agrees
    p = PRESETS.get(JOB.get("preset") or "reel_fast", PRESETS["reel_fast"])
    count = max(1, len(specs))
    works = [ClipWork(spec, n, count, p) for n, spec in enumerate(specs)]
    # First-clip guess for Wan 2.2 A14B (LightX2V, one expert per T4) incl. model load, product lock and encode.
    default_clip = globals().get("DEFAULT_CLIP_SECONDS", {"reel_hq": 2400, "reel_fast": 1500}).get(
        JOB.get("preset") or "reel_fast", 1500)
    clip_seconds = []
    gpu0, gpu1, cpu = _queue.PriorityQueue(), _queue.Queue(), _queue.Queue()
    order = itertools.count()
    ended = _queue.Queue()  # one ("done" | "failed" | "deferred", work, error) per clip
    lock = threading.Lock()

    def overall():
        return 32 + 56 * sum(w.share for w in works) / count

    def progress(work, share, message, force=False, stage="rendering", **extra):
        with lock:  # sent under the lock too (it only queues the message), so the bar never steps back
            work.share = max(work.share, min(1.0, share))
            report.send(stage, overall(), message, force=force, clipKey=work.key, **extra)

    def retry(work, error, engine_name):
        """Out of GPU memory: the next smaller size; a crashed ComfyUI: restarted once. Back to GPU 0 either way."""
        engine = ENGINES.get(engine_name)
        if is_oom(error) and work.rung < len(SIZE_LADDER) - 1 and engine_alive(engine):
            free_comfy_memory(engine)
            old = SIZE_LADDER[work.rung]
            work.rung += 1
            progress(work, 0, f"Out of GPU memory at {old[0]}x{old[1]} — retrying {work.label} at "
                     f"{SIZE_LADDER[work.rung][0]}x{SIZE_LADDER[work.rung][1]}", True)
        elif engine is not None and engine_name not in work.restarts and is_crash(error, engine):
            work.restarts.add(engine_name)
            print(f"ComfyUI ({engine_name}) crashed:", error, open(engine["log"]).read()[-1500:]
                  if os.path.exists(engine["log"]) else "", flush=True)
            progress(work, 0, f"The video engine stopped — restarting it and rendering {work.label} again", True)
            restart_engine(engine_name)
        else:
            return False
        gpu0.put((0, next(order), work))
        return True

    def worker(source, name, handle):
        while True:
            item = source.get()
            work = item[-1] if isinstance(item, tuple) else item
            if work is None:
                return
            try:
                handle(work)
            except BaseException as exc:  # never lose a clip: every one ends with exactly one event
                if name in ("a", "b"):
                    try:
                        if retry(work, exc, name):
                            continue
                    except BaseException as again:
                        exc = again
                traceback.print_exc()
                ended.put(("failed", work, exc))

    def on_gpu0(work):
        if work.started is None:  # a new clip: only when it can still finish inside this Kaggle session
            estimate = (sum(clip_seconds) / len(clip_seconds)) if clip_seconds else default_clip
            if time_left() < estimate * 1.2 + 300:
                ended.put(("deferred", work, None))
                return
            work.started = time.time()
        stage_gpu0(work, progress)
        (gpu1 if split else cpu).put(work)

    def on_gpu1(work):
        stage_gpu1(work, progress)
        cpu.put(work)

    def on_cpu(work):
        if work.key == "logo" and work.started is None:
            work.started = time.time()
        if stage_cpu(work, progress) == "retake":
            work.attempt += 1
            gpu0.put((0, next(order), work))  # a new take goes before the next new clip
            return
        if work.key != "logo":  # the CPU-only logo would make the estimate for the next scene far too short
            clip_seconds.append(time.time() - work.started)
        ended.put(("done", work, None))

    for work in works:  # the logo clip is animated on the CPU while GPU 0 starts on the first scene
        if work.key == "logo":
            cpu.put(work)
        else:
            gpu0.put((1, next(order), work))
    threads = [threading.Thread(target=worker, args=(gpu0, "a", on_gpu0), daemon=True),
               threading.Thread(target=worker, args=(cpu, "cpu", on_cpu), daemon=True)]
    if split:
        threads.append(threading.Thread(target=worker, args=(gpu1, "b", on_gpu1), daemon=True))
    for t in threads:
        t.start()

    failed, deferred = [], []
    try:
        for _ in works:
            outcome, work, error = ended.get()
            release_clip(work)
            if outcome == "failed":
                failed.append(work.key)
                progress(work, 1.0, f"{type(error).__name__}: {error}", True, stage="clipFailed")
            elif outcome == "deferred":
                deferred.append(work.key)
    finally:
        gpu0.put((-1, -1, None))
        gpu1.put(None)
        cpu.put(None)
    if deferred:
        handover(overall(), f"clip {deferred[0]}")
    if works and len(failed) == len(works):
        raise RuntimeError("Every clip failed: " + ", ".join(failed))
    report.send("completed", 100, f"Done ({len(works) - len(failed)}/{len(works)} clips)", status="completed",
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

/** Every video and voice file must be reachable from the account (setup check). */
const VIDEO_MODEL_CHECKS = [...VIDEO_MODEL_FILES, ...FAST_VIDEO_MODEL_FILES, ...VOICE_MODEL_FILES]
  .map((f) => JSON.stringify(f.url) + ',')
  .join('\n        ');

/** Python string literal holding the job JSON (JSON escapes are valid Python string escapes). */
export function jobLiteral(job: WorkerNotebookJob): string {
  return JSON.stringify(JSON.stringify(job));
}

/** Model files as a Python list of (url, path) tuples (JSON strings are valid Python strings). */
export function modelFilesPy(files: { url: string; path: string }[]): string {
  return '[\n' + files.map((f) => `    (${JSON.stringify(f.url)},\n     ${JSON.stringify(f.path)}),`).join('\n') + '\n]';
}

const VIDEO_MODEL_FILES_PY = modelFilesPy(VIDEO_MODEL_FILES);

export function buildWorkerNotebook(job: WorkerNotebookJob): Record<string, unknown> {
  // Function replacement: a `$` in the job (titles, presigned URLs) must not be read as a replacement pattern.
  const reporter = CELL_REPORTER.replace('__JOB_JSON__', () => jobLiteral(job));
  const render = CELL_RENDER_AND_MERGE.replace('__VIDEO_MODEL_NAMES__', () => JSON.stringify(VIDEO_MODEL_NAMES));
  const cells =
    job.kind === 'setup'
      ? [
          code(reporter),
          code(COLAB_RUNTIME_PY),
          code(
            CELL_SETUP_CHECK.replace('__VIDEO_MODEL_CHECKS__', () => VIDEO_MODEL_CHECKS)
              .replace('__IMAGE_MODEL_CHECKS__', () => IMAGE_MODEL_CHECKS)
              .replace('__GATED_MODEL_CHECKS__', () => GATED_MODEL_CHECKS),
          ),
          code(CELL_MODEL_CACHE),
        ]
      : job.clips?.length
        ? [
            code(reporter),
            code(CELL_INSTALL),
            code(CELL_MODELS.replace('__VIDEO_MODEL_FILES__', () => VIDEO_MODEL_FILES_PY)),
            code(CELL_COMFY),
            code(PRODUCT_RESTORE_PY),
            code(render),
            code(CELL_RUN),
          ]
        : // A job without clips (left over from the retired merge step): nothing to render, it just completes.
          [code(reporter), code(CELL_INSTALL), code(render), code(CELL_RUN)];
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
