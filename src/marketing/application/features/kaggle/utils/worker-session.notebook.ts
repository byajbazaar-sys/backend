import { COLAB_RUNTIME_PY } from './colab-runtime.notebook';
import { IMAGE_MODELS, IMAGE_PIP_PACKAGES } from './image-worker.notebook';
import { IMAGE_COMFY_FILES, VOICE_MODEL_FILES } from './model-cache';
import { WorkerSessionNotebookJob } from './worker-session-notebook-job';

const md = (source: string) => ({ cell_type: 'markdown', metadata: {}, source });
const code = (source: string) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source });

const CELL_SESSION = `
import os, sys, json, time, subprocess, traceback, glob, gc
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "websocket-client", "requests"], check=False)
import requests

SESSION = json.loads(__JOB_JSON__)
SESSION_START = time.time()
API = SESSION["apiBaseUrl"].rstrip("/") + "/api/v1/public/marketing"
# Survives between jobs: loaded models, running ComfyUI, installed packages, LOCAL_MODELS, release hooks.
WORKER = {"local_models": {}}


def remaining():
    return SESSION["sessionSeconds"] - (time.time() - SESSION_START)


def post(path, body, timeout=60):
    last = None
    for attempt in range(3):
        try:
            r = requests.post(API + path, json=body, timeout=timeout)
            if r.status_code == 403:
                raise PermissionError("the backend no longer accepts this worker session")
            r.raise_for_status()
            body = r.json() if r.content else {}
            # The API wraps answers as {"statusCode", "message", "data"}.
            if isinstance(body, dict) and "statusCode" in body:
                return body.get("data") or {}
            return body
        except PermissionError:
            raise
        except Exception as exc:
            last = exc
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"POST {path} failed: {last}")


def session_event(stage, message, status=None, **extra):
    body = {"action": "marketingProgress", "jobId": SESSION["jobId"], "token": SESSION["token"], "stage": stage,
            "progress": 0, "message": str(message)[:240], **extra}
    if status:
        body["status"] = status
    print(f"[{time.strftime('%H:%M:%S')}] session {stage}: {message}", flush=True)
    try:
        post("/worker-events", body)
    except Exception as exc:
        print("session event failed:", exc, flush=True)


session_event("sessionBooting", "Warm GPU worker booting")
`;

const CELL_MODELS = `
# The model cache built by the account setup: on Kaggle a private dataset mounted read-only under /kaggle/input (its
# files are symlinked where the job notebooks look for them); on Colab Enterprise a gs:// prefix in the account's
# bucket (its files are copied there in the background, next cell). Either way the jobs skip their downloads; without
# a cache they download as usual.
COMFY_DIR = "/tmp/ComfyUI"
BOOT_CONFIG = json.loads(__BOOT_JSON__)
LINKED = []  # (dataset file, symlink, group) — copied to the local disk in the background (next cell)
GCS_FILES = []  # Colab: (gs:// uri, destination, group) — downloaded in the background (next cell)
COLAB = SESSION.get("provider") == "colab"
if COLAB:
    big_disk()
try:
    if not os.path.isdir(os.path.join(COMFY_DIR, "comfy")):
        subprocess.run(["git", "clone", "--depth", "1", "https://github.com/comfyanonymous/ComfyUI.git", COMFY_DIR],
                       check=True, capture_output=True)
    manifests = glob.glob("/kaggle/input/**/byajbazaar-models.json", recursive=True)
    prefix = SESSION.get("modelsGcs") if COLAB else None
    if prefix:
        try:
            gcs_download(f"{prefix}/byajbazaar-models.json", "/tmp/bb-gcs/byajbazaar-models.json")
            manifests = ["/tmp/bb-gcs/byajbazaar-models.json"]
        except Exception as exc:
            print("Model cache in Cloud Storage not readable (jobs download the models):", exc, flush=True)
            prefix = None
    linked = 0
    if manifests:
        base = os.path.dirname(manifests[0])
        manifest = json.load(open(manifests[0]))
        for f in manifest.get("files", []):
            src = os.path.join(base, f["name"])
            if not prefix and not os.path.exists(src):
                continue
            if f["kind"] == "comfy":
                dst = os.path.join(COMFY_DIR, f["path"])
                group = ("klein" if f["path"] in BOOT_CONFIG["kleinPaths"]
                         else "voice" if f["path"] in BOOT_CONFIG["voicePaths"] else "video")
            else:
                root = "/tmp/bb-hf/" + f["repo"].replace("/", "--")
                dst = os.path.join(root, f["path"])
                WORKER["local_models"][f["repo"]] = root
                group = "analyst" if f["repo"] == BOOT_CONFIG["analyst"] else "segmenter"
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if prefix:
                if not os.path.exists(dst):
                    GCS_FILES.append((f"{prefix}/{f['name']}", dst, group))
                    linked += 1
                continue
            if not os.path.lexists(dst):
                os.symlink(src, dst)
                linked += 1
            if os.path.islink(dst):
                LINKED.append((src, dst, group))
    MODELS_CACHED = linked > 0
    print(f"Model cache: {('Cloud Storage, ' + str(linked) + ' files to copy') if prefix else ('mounted, ' + str(linked) + ' files linked') if MODELS_CACHED else 'not available'}", flush=True)
except Exception as exc:
    traceback.print_exc()
    MODELS_CACHED = False
`;

const CELL_BOOT = `
# Background setup, so jobs don't wait for it: pip installs for the image notebook and ComfyUI, and a local copy of
# every cached model file. Files are copied to <name>.staging on the local disk and then renamed over the symlink, so
# a job never sees a half-written file, and later loads (and reloads after switching between image and video work)
# read the fast local disk instead of the dataset mount. Jobs wait for the step they need (WORKER["boot"]).
import threading, shutil

BOOT = {key: threading.Event() for key in ("image_packages", "comfy_requirements", "analyst", "segmenter", "klein",
                                           "voice", "video")}
WORKER["boot"] = BOOT
DISK_RESERVE = 12e9  # left free for outputs, pip and ComfyUI's own files; files that don't fit stay on the mount


def boot_installs():
    steps = (("image_packages", BOOT_CONFIG["imagePip"]),
             ("comfy_requirements", ["-r", f"{COMFY_DIR}/requirements.txt"]))
    for key, args in steps:
        started = time.time()
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", *args], check=True, capture_output=True)
            WORKER[key] = True
            print(f"Boot: {key} installed in {time.time() - started:.0f}s", flush=True)
        except Exception as exc:
            print(f"Boot: {key} install failed (the job installs it instead): {exc}", flush=True)
        finally:
            BOOT[key].set()


def stage(src, dst):
    size = os.path.getsize(src)
    if shutil.disk_usage("/tmp").free - size < DISK_RESERVE:
        return False
    tmp = dst + ".staging"
    try:
        with open(src, "rb") as fin, open(tmp, "wb") as fout:
            shutil.copyfileobj(fin, fout, 64 * 1024 * 1024)
        os.replace(tmp, dst)
        return True
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def boot_staging():
    started, copied, kept = time.time(), 0, 0
    # In the order a job needs them: the analyst plans first, then klein paints; video files last.
    for group in ("analyst", "segmenter", "klein", "voice", "video"):
        try:
            for uri, dst, _ in [item for item in GCS_FILES if item[2] == group]:  # Colab: from the bucket
                try:
                    gcs_download(uri, dst)
                    copied += 1
                except Exception as exc:
                    kept += 1
                    print(f"Boot: could not copy {os.path.basename(dst)} from Cloud Storage ({exc}); the job "
                          "downloads it", flush=True)
            for src, dst, _ in [item for item in LINKED if item[2] == group]:
                try:
                    if os.path.islink(dst) and stage(src, dst):
                        copied += 1
                    else:
                        kept += 1
                except Exception as exc:
                    kept += 1
                    print(f"Boot: could not copy {os.path.basename(dst)} ({exc}); it is read from the mount", flush=True)
        finally:
            BOOT[group].set()
    if LINKED or GCS_FILES:
        print(f"Boot: {copied} model files copied to the local disk in {time.time() - started:.0f}s"
              + (f", {kept} not copied" if kept else ""), flush=True)


threading.Thread(target=boot_installs, daemon=True).start()
threading.Thread(target=boot_staging, daemon=True).start()
`;

const CELL_LOOP = `
def free_gpus():
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def release_all():
    """Before switching between image and video work: stop ComfyUI and drop the analyst, freeing both GPUs.
    (Job namespaces are cleared after each job, so this lives here and only touches WORKER.)"""
    for key in ("comfy_image", "comfy_video", "comfy_voice"):
        proc = (WORKER.pop(key, None) or {}).get("proc")
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(30)
            except Exception:
                proc.kill()
    WORKER.pop("vlm", None)
    subprocess.run(["pkill", "-f", f"{COMFY_DIR}/main.py"], check=False)
    time.sleep(3)
    free_gpus()


def run_job(job):
    """Runs the job's notebook cells in a fresh namespace that shares WORKER (warm models)."""
    ns = {"WORKER": WORKER, "__name__": "__main__", "__builtins__": __builtins__}
    try:
        for i, source in enumerate(job["cells"]):
            exec(compile(source, f"<{job['kind'].lower()} job {job['id'][:8]} cell {i + 1}>", "exec"), ns)
        return None
    except KeyboardInterrupt:
        raise
    except BaseException as exc:  # the job reports its own failure; the session carries on
        traceback.print_exc()
        return f"{type(exc).__name__}: {exc}"[:400]
    finally:
        ns.clear()
        free_gpus()


LISTENER = {"ws": None}


def wait_for_work(seconds, register):
    """Idle: sleep on the WebSocket until the backend pushes 'marketingWake' (work was queued), or the poll interval
    passes. register = the backend does not know this socket yet. Any socket problem: plain sleep, retry next time."""
    deadline = time.time() + seconds
    if not SESSION.get("wsUrl"):
        time.sleep(seconds)
        return
    try:
        import websocket
        if LISTENER["ws"] is None:
            url = f"{SESSION['wsUrl']}?workerJob={SESSION['jobId']}&workerToken={SESSION['token']}"
            LISTENER["ws"] = websocket.create_connection(url, timeout=20)
            register = True
        ws = LISTENER["ws"]
        if register:
            ws.send(json.dumps({"action": "marketingProgress", "jobId": SESSION["jobId"], "token": SESSION["token"],
                                "stage": "sessionListening", "progress": 0, "message": "Warm GPU worker listening"}))
        while time.time() < deadline:
            ws.settimeout(max(0.5, deadline - time.time()))
            try:
                msg = ws.recv()
            except websocket.WebSocketTimeoutException:
                return
            try:
                if json.loads(msg).get("type") == "marketingWake":
                    return
            except Exception:
                pass  # acks and other messages: keep waiting
    except Exception as exc:
        print("wake socket unavailable (polling instead):", exc, flush=True)
        try:
            LISTENER["ws"] and LISTENER["ws"].close()
        except Exception:
            pass
        LISTENER["ws"] = None
        time.sleep(max(0.0, deadline - time.time()))


session_event("sessionReady", "Warm GPU worker ready" + (" · models from the cache" if MODELS_CACHED else ""),
              modelsCached=MODELS_CACHED)
jobs_run, poll_failures, finished, job_error, reason = 0, 0, None, None, "stopped"
while True:
    try:
        answer = post("/worker/next", {"sessionId": SESSION["jobId"], "token": SESSION["token"],
                                       "remainingSeconds": int(max(0, remaining())),
                                       "pipeline": WORKER.get("pipeline"), "finishedJobId": finished,
                                       "jobError": job_error})
        poll_failures = 0
    except PermissionError as exc:
        reason = str(exc)
        break
    except Exception as exc:
        poll_failures += 1
        print("poll failed:", exc, flush=True)
        if poll_failures >= 30:  # ~10 minutes without the backend
            reason = "the backend could not be reached"
            break
        time.sleep(10)
        continue
    finished, job_error = None, None
    if answer.get("stop"):
        reason = answer.get("reason") or "stopped by the backend"
        break
    job = answer.get("job")
    if not job:
        wait_for_work(answer.get("pollSeconds") or 10, register=not answer.get("listening"))
        continue
    # "cpu" = no GPU model needed (the CPU-animated logo clip): keep whatever models are loaded for the next GPU job.
    # "voice" = ChatterBox: small, runs beside whatever is loaded (its own ComfyUI on a GPU with room) — it never
    # makes the session drop its image / video models. Before image or video work, the voice engine makes room.
    if job["pipeline"] in ("image", "video", "video-fast") and WORKER.get("comfy_voice"):
        voice = WORKER.pop("comfy_voice", None) or {}
        if voice.get("proc") is not None and voice["proc"].poll() is None:
            voice["proc"].terminate()
            try:
                voice["proc"].wait(30)
            except Exception:
                voice["proc"].kill()
        free_gpus()
    if job["pipeline"] not in ("cpu", "voice"):
        if WORKER.get("pipeline") not in (None, job["pipeline"]):
            print(f"Switching the GPUs from {WORKER['pipeline']} to {job['pipeline']} work", flush=True)
            release_all()
        WORKER["pipeline"] = job["pipeline"]
    print(f"=== job {job['id']} ({job['kind']}) · {remaining() / 3600:.1f} h of session left", flush=True)
    started = time.time()
    job_error = run_job(job)
    finished = job["id"]
    jobs_run += 1
    print(f"=== job {job['id']} finished in {(time.time() - started) / 60:.1f} min"
          + (f" with an error: {job_error}" if job_error else ""), flush=True)

try:
    LISTENER["ws"] and LISTENER["ws"].close()
except Exception:
    pass
release_all()
session_event("completed", f"Warm worker stopped after {jobs_run} job(s): {reason}", status="completed")
`;

/** What the session's background setup installs, and which cached files belong to which model. */
const BOOT_CONFIG = {
  imagePip: IMAGE_PIP_PACKAGES,
  analyst: IMAGE_MODELS.analyst,
  kleinPaths: IMAGE_COMFY_FILES.map((f) => f.path),
  voicePaths: VOICE_MODEL_FILES.map((f) => f.path),
};

/** Python string literal holding a JSON document (JSON escapes are valid Python string escapes). */
const pyJson = (value: unknown): string => JSON.stringify(JSON.stringify(value));

/**
 * Warm worker session: one long Kaggle session that mounts the model cache, then asks the backend for work
 * (`POST /public/marketing/worker/next`) and runs each job's notebook cells in-process, keeping models and ComfyUI
 * loaded between jobs. It stops when the backend says so (idle timeout, session time used up).
 */
export function buildWorkerSessionNotebook(job: WorkerSessionNotebookJob): Record<string, unknown> {
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
        `# ByajBazaar warm GPU worker\n\n` +
          `Auto-generated for session \`${job.jobId}\` — do not edit. Pulls image and video jobs from ByajBazaar and ` +
          `keeps the models loaded between them.`,
      ),
      code(CELL_SESSION.replace('__JOB_JSON__', () => pyJson(job))),
      code(COLAB_RUNTIME_PY),
      code(CELL_MODELS.replace('__BOOT_JSON__', () => pyJson(BOOT_CONFIG))),
      code(CELL_BOOT),
      code(CELL_LOOP),
    ],
  };
}
