import { COLAB_RUNTIME_PY } from './colab-runtime.notebook';
import { IMAGE_MODELS, IMAGE_PIP_PACKAGES } from './image-worker.notebook';
import { IMAGE_COMFY_FILES, VOICE_MODEL_FILES } from './model-cache';
import { voiceEngineSource } from './voice-worker.notebook';
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

/**
 * ByajBazaar AI voice lane (Backend/docs/AI_VOICE.md §2a). With SESSION["aiVoice"], a background thread keeps a
 * WebSocket to the Cloudflare voice gateway and speaks the assistant's Hindi replies with ChatterBox — the Voice
 * studio's own engine (ComfyUI on port 8190, started with the voice job's own set-up code). It runs beside the job loop,
 * not through the queue, and its prompts go to the front of the voice engine's queue: the assistant never waits behind
 * marketing work. While the assistant is in use ("hot") the session reports it at every poll and takes voice jobs only;
 * image / video work (which needs the GPUs) is never started under it, and the lane steps aside while such work runs.
 */
const CELL_AI_VOICE = String.raw`
import threading, re
WORKER["voice_lock"] = WORKER.get("voice_lock") or threading.RLock()
WORKER["heavy"] = False
WORKER["stopping"] = False
AI_VOICE = SESSION.get("aiVoice")


def ai_voice_hot():
    state = WORKER.get("ai_voice")
    return bool(state and state["hot_until"] > time.time())


if AI_VOICE:
    import uuid, shutil
    from urllib.parse import quote
    import websocket

    AI_VOICE_ENGINE_SRC = json.loads(__VOICE_ENGINE_JSON__)
    AI_PORT = 8190
    AI_BASE = f"http://127.0.0.1:{AI_PORT}"
    AI = {"hot_until": 0.0, "starting": False, "current": None, "prompt": None, "cancelled": set(), "ws": None,
          "ffmpeg": None}
    WORKER["ai_voice"] = AI
    AI_SEND = threading.Lock()
    AI_SPEAK = threading.Lock()
    AI_FIRST_PART, AI_PART_LIMIT, AI_MAX_PARTS = 80, 160, 10
    AI_SETTINGS = {"exaggeration": 0.5, "cfg_weight": 0.5, "temperature": 0.8, "repetition_penalty": 2.0,
                   "min_p": 0.05, "top_p": 1.0}
    AI_LABELS = {"hi": "Hindi (hi)", "en": "English (en)"}
    AI_SEED = 4242  # one voice for every reply

    class _AiQuiet:
        def send(self, *args, **kwargs):
            pass

    def ai_ffmpeg():
        if AI["ffmpeg"]:
            return AI["ffmpeg"]
        exe = shutil.which("ffmpeg")
        if not exe:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "imageio-ffmpeg>=0.5.1"], check=True)
            import imageio_ffmpeg
            exe = imageio_ffmpeg.get_ffmpeg_exe()
        AI["ffmpeg"] = exe
        return exe

    def ai_engine_ready():
        voice = WORKER.get("comfy_voice")
        return bool(voice and voice.get("proc") is not None and voice["proc"].poll() is None)

    def ai_send(payload, binary=None):
        ws = AI["ws"]
        if ws is None:
            return
        with AI_SEND:
            ws.send(json.dumps(payload))
            if binary is not None:
                ws.send_binary(binary)

    def ai_status():
        try:
            ai_send({"type": "status", "engineReady": ai_engine_ready() and not WORKER.get("heavy"),
                     "busy": AI["current"] is not None})
        except Exception:
            pass

    def ai_start_engine():
        """The voice engine, brought up with the voice job's own set-up code (same models, node and GPU choice)."""
        try:
            with WORKER["voice_lock"]:
                if ai_engine_ready() or WORKER.get("heavy") or WORKER.get("stopping"):
                    return
                print("AI voice: starting the voice engine", flush=True)
                ns = {"WORKER": WORKER, "report": _AiQuiet(), "find_ffmpeg": ai_ffmpeg, "__name__": "__ai_voice__",
                      "__builtins__": __builtins__}
                exec("import os, sys, json, time, subprocess, shutil, glob, traceback, threading, uuid, re\nimport requests",
                     ns)
                exec(compile(AI_VOICE_ENGINE_SRC, "<ai voice engine>", "exec"), ns)
                print("AI voice: voice engine ready", flush=True)
        except BaseException as exc:
            print("AI voice: the voice engine did not start:", exc, flush=True)
        finally:
            AI["starting"] = False
            ai_status()

    def ai_split(text):
        """Sentence parts; the first one short so its audio is ready sooner."""
        parts, current = [], ""
        for sentence in (s.strip() for s in re.split(r"(?<=[.!?।])\s+|\n+", str(text or "")) if s and s.strip()):
            limit = AI_FIRST_PART if not parts and not current else AI_PART_LIMIT
            while len(sentence) > limit:
                if current:
                    parts.append(current)
                    current = ""
                cut = max(sentence.rfind(", ", 0, limit), sentence.rfind(" ", 0, limit))
                cut = cut + 1 if cut > limit // 2 else limit
                parts.append(sentence[:cut].strip())
                sentence = sentence[cut:].strip()
                limit = AI_PART_LIMIT
            if not sentence:
                continue
            if current and len(current) + 1 + len(sentence) > limit:
                parts.append(current)
                current = sentence
            else:
                current = (current + " " + sentence).strip()
        if current:
            parts.append(current)
        return [p for p in parts if p][:AI_MAX_PARTS]

    def ai_node(info, cls, **inputs):
        """A ComfyUI API node checked against the engine's /object_info (unknown inputs dropped, defaults filled)."""
        spec = (info.get(cls) or {}).get("input", {})
        if not spec:
            raise RuntimeError(f"The voice engine has no {cls} node")
        known = {**spec.get("required", {}), **spec.get("optional", {})}
        inputs = {k: v for k, v in inputs.items() if k in known}
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

    def ai_mp3(path):
        done = subprocess.run([ai_ffmpeg(), "-hide_banner", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", "24000",
                               "-c:a", "libmp3lame", "-b:a", "64k", "-f", "mp3", "-"], capture_output=True)
        if done.returncode != 0:
            raise RuntimeError("ffmpeg failed: " + done.stderr.decode(errors="replace")[-300:])
        return done.stdout

    def ai_speak(event):
        rid = str(event.get("id") or "")[:64]
        with AI_SPEAK:
            if rid in AI["cancelled"]:
                return
            if not ai_engine_ready() or WORKER.get("heavy"):
                ai_send({"type": "error", "id": rid, "message": "the voice engine is not ready"})
                return
            AI["current"] = rid
            ai_status()
            files, comfy = [], None
            started = time.time()
            try:
                info = WORKER["comfy_voice"]["info"]
                parts = ai_split(event.get("text"))
                if not parts:
                    raise ValueError("nothing to say")
                label = AI_LABELS.get(event.get("language") or "hi", "Hindi (hi)")
                tag = uuid.uuid4().hex[:8]
                graph = {}
                for i, part in enumerate(parts):
                    graph[f"tts{i}"] = ai_node(info, "FL_ChatterboxMultilingualTTS", text=part, language=label,
                                               seed=AI_SEED, use_cpu=False, keep_model_loaded=True, **AI_SETTINGS)
                    graph[f"save{i}"] = ai_node(info, "SaveAudio", audio=[f"tts{i}", 0],
                                                filename_prefix=f"aivoice/{tag}_{i:03d}")
                client_id = uuid.uuid4().hex
                comfy = websocket.create_connection(f"ws://127.0.0.1:{AI_PORT}/ws?clientId={client_id}", timeout=30)
                # front: ahead of any marketing voiceover waiting in the same engine.
                r = requests.post(AI_BASE + "/prompt", json={"prompt": graph, "client_id": client_id, "front": True},
                                  timeout=30)
                if not r.ok:
                    raise RuntimeError("the voice engine refused the request: " + r.text[:300])
                pid = r.json()["prompt_id"]
                AI["prompt"] = pid
                ready, sent = {}, 0
                comfy.settimeout(90)
                while sent < len(parts):
                    msg = comfy.recv()
                    if not isinstance(msg, str):
                        continue
                    ev = json.loads(msg)
                    kind, data = ev.get("type"), ev.get("data") or {}
                    if data.get("prompt_id") not in (None, pid):
                        continue
                    if kind == "executed" and str(data.get("node") or "").startswith("save"):
                        index = int(str(data["node"])[4:])
                        saved = (data.get("output") or {}).get("audio") or []
                        if not saved:
                            raise RuntimeError(f"part {index + 1} produced no audio")
                        f = saved[0]
                        path = os.path.join(COMFY_DIR, f.get("type") or "output", f.get("subfolder", ""), f["filename"])
                        files.append(path)
                        ready[index] = ai_mp3(path)
                        # In order: a part that finished early waits for the ones before it.
                        while sent in ready and rid not in AI["cancelled"]:
                            ai_send({"type": "audio", "id": rid, "segment": sent, "mime": "audio/mpeg",
                                     "last": sent == len(parts) - 1}, ready.pop(sent))
                            if sent == 0:
                                print(f"AI voice: first audio after {time.time() - started:.1f}s", flush=True)
                            sent += 1
                        if rid in AI["cancelled"]:
                            break
                    elif kind == "execution_error":
                        raise RuntimeError(f"{data.get('node_type')}: {data.get('exception_message')}")
                    elif kind == "execution_interrupted":
                        break
                ai_send({"type": "done", "id": rid})
            except Exception as exc:
                traceback.print_exc()
                try:
                    ai_send({"type": "error", "id": rid, "message": f"{type(exc).__name__}: {exc}"[:300]})
                except Exception:
                    pass
            finally:
                AI["current"] = None
                AI["prompt"] = None
                try:
                    comfy and comfy.close()
                except Exception:
                    pass
                for f in files:
                    try:
                        os.remove(f)
                    except OSError:
                        pass
                ai_status()

    def ai_cancel(rid):
        AI["cancelled"].add(rid)
        if len(AI["cancelled"]) > 200:
            AI["cancelled"] = {rid}
        pid = AI.get("prompt")
        if AI["current"] != rid or not pid:
            return
        try:
            queue = requests.get(AI_BASE + "/queue", timeout=5).json()
            if any(item[1] == pid for item in queue.get("queue_running", [])):
                requests.post(AI_BASE + "/interrupt", timeout=5)
            else:
                requests.post(AI_BASE + "/queue", json={"delete": [pid]}, timeout=5)
        except Exception:
            pass

    def ai_lane():
        backoff = 2
        while not WORKER.get("stopping"):
            try:
                url = AI_VOICE["url"] + ("&" if "?" in AI_VOICE["url"] else "?") + "token=" + quote(AI_VOICE["token"], safe="")
                AI["ws"] = websocket.create_connection(url, timeout=20)
                backoff = 2
                ai_send({"type": "hello", "sessionId": SESSION["jobId"],
                         "engineReady": ai_engine_ready() and not WORKER.get("heavy"), "busy": AI["current"] is not None})
                print("AI voice: connected to the voice gateway", flush=True)
                last = None
                while not WORKER.get("stopping"):
                    ready = ai_engine_ready() and not WORKER.get("heavy")
                    if not ready and ai_voice_hot() and not WORKER.get("heavy") and not AI["starting"]:
                        AI["starting"] = True
                        threading.Thread(target=ai_start_engine, daemon=True).start()
                    if ready != last:
                        ai_status()
                        last = ready
                    AI["ws"].settimeout(1.0)
                    try:
                        msg = AI["ws"].recv()
                    except websocket.WebSocketTimeoutException:
                        continue
                    if not isinstance(msg, str):
                        continue
                    event = json.loads(msg)
                    kind = event.get("type")
                    if kind == "speak":
                        AI["hot_until"] = max(AI["hot_until"], time.time() + 600)
                        threading.Thread(target=ai_speak, args=(event,), daemon=True).start()
                    elif kind == "cancel":
                        ai_cancel(str(event.get("id") or ""))
                    elif kind == "demand":
                        AI["hot_until"] = max(AI["hot_until"], time.time() + float(event.get("seconds") or 600))
                    elif kind == "ping":
                        ai_send({"type": "pong"})
            except Exception as exc:
                print("AI voice lane:", exc, flush=True)
            finally:
                try:
                    AI["ws"] and AI["ws"].close()
                except Exception:
                    pass
                AI["ws"] = None
            if not WORKER.get("stopping"):
                time.sleep(backoff)
                backoff = min(60, backoff * 2)

    threading.Thread(target=ai_lane, daemon=True).start()
    print("AI voice lane started", flush=True)
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
                                       "jobError": job_error, "aiVoiceHot": ai_voice_hot()})
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
    heavy = job["pipeline"] in ("image", "video", "video-fast")
    with WORKER["voice_lock"]:  # the AI voice lane never (re)starts the engine while heavy work holds the GPUs
        WORKER["heavy"] = heavy
        if heavy and WORKER.get("comfy_voice"):
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
    if job["pipeline"] == "voice":
        with WORKER["voice_lock"]:  # a voiceover sets the engine up itself: the lane waits instead of racing it
            job_error = run_job(job)
    else:
        job_error = run_job(job)
    WORKER["heavy"] = False
    finished = job["id"]
    jobs_run += 1
    print(f"=== job {job['id']} finished in {(time.time() - started) / 60:.1f} min"
          + (f" with an error: {job_error}" if job_error else ""), flush=True)

WORKER["stopping"] = True
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
      code(CELL_AI_VOICE.replace('__VOICE_ENGINE_JSON__', () => pyJson(voiceEngineSource()))),
      code(CELL_LOOP),
    ],
  };
}
