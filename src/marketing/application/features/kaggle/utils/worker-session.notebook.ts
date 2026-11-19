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
# The private model dataset (built by the account setup) is mounted read-only under /kaggle/input: symlink its files
# where the job notebooks look for them, so they skip their downloads. Without it they download as usual.
COMFY_DIR = "/tmp/ComfyUI"
try:
    if not os.path.isdir(COMFY_DIR):
        subprocess.run(["git", "clone", "--depth", "1", "https://github.com/comfyanonymous/ComfyUI.git", COMFY_DIR],
                       check=True, capture_output=True)
    manifests = glob.glob("/kaggle/input/**/byajbazaar-models.json", recursive=True)
    linked = 0
    if manifests:
        base = os.path.dirname(manifests[0])
        manifest = json.load(open(manifests[0]))
        for f in manifest.get("files", []):
            src = os.path.join(base, f["name"])
            if not os.path.exists(src):
                continue
            if f["kind"] == "comfy":
                dst = os.path.join(COMFY_DIR, f["path"])
            else:
                root = "/tmp/bb-hf/" + f["repo"].replace("/", "--")
                dst = os.path.join(root, f["path"])
                WORKER["local_models"][f["repo"]] = root
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if not os.path.lexists(dst):
                os.symlink(src, dst)
                linked += 1
    MODELS_CACHED = linked > 0
    print(f"Model cache: {'mounted, ' + str(linked) + ' files linked' if MODELS_CACHED else 'not available'}", flush=True)
except Exception as exc:
    traceback.print_exc()
    MODELS_CACHED = False
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
    for key in ("comfy_image", "comfy_video"):
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
        time.sleep(answer.get("pollSeconds") or 10)
        continue
    # "cpu" = a merge-only job (ffmpeg): keep whatever models are loaded for the next GPU job.
    if job["pipeline"] != "cpu":
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

release_all()
session_event("completed", f"Warm worker stopped after {jobs_run} job(s): {reason}", status="completed")
`;

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
      code(CELL_MODELS),
      code(CELL_LOOP),
    ],
  };
}
