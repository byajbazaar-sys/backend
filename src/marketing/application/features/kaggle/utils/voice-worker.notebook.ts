import { VOICE_MODEL_FILES } from './model-cache';
import { CELL_REPORTER } from './reel-worker.notebook';
import { VoiceNotebookJob } from './voice-notebook-job';

const md = (source: string) => ({ cell_type: 'markdown', metadata: {}, source });
const code = (source: string) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source });

/** ComfyUI + ComfyUI_Fill-ChatterBox on port 8190, on whichever T4 has room (Python, String.raw: no escaping). */
const CELL_VOICE_ENGINE = String.raw`
# ---- Voice engine: ComfyUI + ComfyUI_Fill-ChatterBox on its own port, next to whatever the session has loaded ----
# ChatterBox Multilingual is small (~3-4 GB of VRAM), so it runs on whichever T4 has room — normally GPU 1 beside the
# image analyst — instead of making a warm session drop klein / Qwen3-VL / Wan. Its ComfyUI stays up between voice
# jobs (the model stays loaded); the session stops it before image or video work needs the memory.
COMFY_DIR = "/tmp/ComfyUI"
VOICE_PORT = 8190
VOICE = f"http://127.0.0.1:{VOICE_PORT}"
NODE_DIR = f"{COMFY_DIR}/custom_nodes/ComfyUI_Fill-ChatterBox"
NODE_REPO = "https://github.com/filliptm/ComfyUI_Fill-ChatterBox.git"
VOICE_FILES = __VOICE_MODEL_FILES__
OUT_DIR = ("/kaggle/working" if os.path.isdir("/kaggle/working") else "/tmp") + "/voice"
NEED_MIB = 5000  # VRAM the voice engine wants free on its GPU


def boot_wait(key, message, progress):
    """Warm session: wait for one of its background setup steps (packages, local model copies)."""
    event = WORKER.get("boot", {}).get(key)
    if event is not None and not event.is_set():
        report.send("voiceSetup", progress, message, force=True)
        event.wait(1500)


def pip(*args):
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", *args], check=True)


def fetch_model(url, rel):
    """A model file the cache did not provide: download to <file>.part, rename when complete."""
    dst = os.path.join(COMFY_DIR, rel)
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    part = dst + ".part"
    for attempt in range(1, 5):
        try:
            with requests.get(url, stream=True, timeout=(30, 300)) as r:
                r.raise_for_status()
                with open(part, "wb") as f:
                    for chunk in r.iter_content(16 * 1024 * 1024):
                        f.write(chunk)
            os.replace(part, dst)
            return
        except requests.RequestException as exc:
            print(f"{rel} download attempt {attempt} failed: {exc}", flush=True)
            time.sleep(5 * attempt)
    raise RuntimeError(f"Could not download {rel}")


def gpu_free_mib():
    out = subprocess.run(["nvidia-smi", "--query-gpu=index,memory.free", "--format=csv,noheader,nounits"],
                         capture_output=True, text=True).stdout
    free = {}
    for line in out.strip().splitlines():
        if "," in line:
            index, mib = line.split(",", 1)
            free[int(index)] = int(float(mib))
    return free


def pick_gpu():
    """The GPU with room for the voice model, preferring GPU 1 (GPU 0 is the image painter). When neither has room,
    the session's main ComfyUI (images / video) lets go of its models for a moment."""
    free = gpu_free_mib()
    if not free:
        return 0
    roomy = [i for i in free if free[i] >= NEED_MIB]
    if roomy:
        return max(roomy)
    try:
        requests.post("http://127.0.0.1:8188/free", json={"unload_models": True, "free_memory": True}, timeout=60)
        time.sleep(3)
        free = gpu_free_mib() or free
    except requests.RequestException:
        pass
    return max(free, key=lambda i: free[i])


def stop_voice_engine():
    state = WORKER.pop("comfy_voice", None)
    proc = (state or {}).get("proc")
    if proc is not None and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(30)
        except Exception:
            proc.kill()


def start_voice_engine(gpu):
    stop_voice_engine()
    env = dict(os.environ)
    env["CUDA_VISIBLE_DEVICES"] = str(gpu)
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    log_path = "/tmp/comfyui-voice.log"
    proc = subprocess.Popen([sys.executable, f"{COMFY_DIR}/main.py", "--listen", "127.0.0.1", "--port", str(VOICE_PORT),
                             "--disable-pinned-memory", "--preview-method", "none"],
                            cwd=COMFY_DIR, env=env, stdout=open(log_path, "w"), stderr=subprocess.STDOUT)
    for _ in range(180):
        if proc.poll() is not None:
            raise RuntimeError("The voice engine exited: " + open(log_path).read()[-1500:])
        try:
            if requests.get(f"{VOICE}/system_stats", timeout=3).ok:
                break
        except requests.RequestException:
            pass
        time.sleep(2)
    info = requests.get(f"{VOICE}/object_info", timeout=60).json()
    if "FL_ChatterboxMultilingualTTS" not in info:
        proc.terminate()
        raise RuntimeError("The ChatterBox node did not load: " + open(log_path).read()[-1500:])
    WORKER["comfy_voice"] = {"proc": proc, "info": info, "gpu": gpu}


try:
    report.send("voiceSetup", 2, "Voice worker started", force=True)
    FFMPEG = find_ffmpeg()
    os.makedirs(OUT_DIR, exist_ok=True)
    running = WORKER.get("comfy_voice")
    if not (running and running["proc"].poll() is None):
        if not os.path.isdir(COMFY_DIR):
            subprocess.run(["git", "clone", "--depth", "1", "https://github.com/comfyanonymous/ComfyUI.git", COMFY_DIR],
                           check=True)
        if not os.path.isdir(NODE_DIR):
            subprocess.run(["git", "clone", "--depth", "1", NODE_REPO, NODE_DIR], check=True)
        if not WORKER.get("voice_installed"):
            report.send("voiceSetup", 4, "Installing the voice engine", force=True)
            boot_wait("comfy_requirements", "Finishing the engine install", 4)
            if not WORKER.get("comfy_requirements"):
                pip("-r", f"{COMFY_DIR}/requirements.txt")
                WORKER["comfy_requirements"] = True
            pip("-r", f"{NODE_DIR}/requirements.txt")
            try:
                pip("pykakasi")  # Japanese text; the node skips it when missing
            except Exception as exc:
                print("pykakasi not installed:", exc, flush=True)
            WORKER["voice_installed"] = True
        boot_wait("voice", "Copying the voice model to the local disk", 6)
        report.send("voiceSetup", 7, "Preparing the voice model", force=True)
        for url, rel in VOICE_FILES:
            fetch_model(url, rel)
        gpu = pick_gpu()
        report.send("voiceSetup", 9, f"Starting the voice engine on GPU {gpu}", force=True)
        start_voice_engine(gpu)
    VOICE_INFO = WORKER["comfy_voice"]["info"]
    report.send("voiceSetup", 12, "Voice engine ready", force=True)
except Exception as exc:
    traceback.print_exc()
    report.send("failed", 0, f"Voice engine failed to start: {type(exc).__name__}: {exc}", status="failed", force=True)
    raise
`;

/** LoadAudio -> FL_ChatterboxMultilingualTTS -> SaveAudio per sentence group, joined into one MP3 and uploaded. */
const CELL_VOICE_RENDER = String.raw`
# ---- Speak the text: LoadAudio (the voice sample) -> FL_ChatterboxMultilingualTTS -> SaveAudio, one part per sentence
# group (the model drifts or stops on long inputs), then the parts are joined with short pauses into one MP3.
PART_LIMIT = 280  # characters per part
PAUSE_SECONDS = 0.3
SAMPLE_RATE = 24000
SENTENCE_END = re.compile(r"(?<=[.!?।。！？])\s+|\n+")


def split_text(text, limit=PART_LIMIT):
    """Sentence groups of at most limit characters; a longer sentence is cut at a comma or a space."""
    parts, current = [], ""
    for sentence in (s.strip() for s in SENTENCE_END.split(str(text or "")) if s and s.strip()):
        while len(sentence) > limit:
            if current:
                parts.append(current)
                current = ""
            cut = max(sentence.rfind(", ", 0, limit), sentence.rfind(" ", 0, limit))
            cut = cut + 1 if cut > limit // 2 else limit
            parts.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if not sentence:
            continue
        if current and len(current) + 1 + len(sentence) > limit:
            parts.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        parts.append(current)
    return parts


def voice_node(cls, **inputs):
    """A ComfyUI API node checked against the voice engine's /object_info (missing widgets get their defaults)."""
    info = VOICE_INFO.get(cls)
    if info is None:
        raise RuntimeError(f"The voice engine has no {cls} node")
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


def run_ffmpeg(args, data=None):
    done = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", *args], input=data, capture_output=True)
    if done.returncode != 0:
        raise RuntimeError("ffmpeg failed: " + done.stderr.decode(errors="replace")[-600:])
    return done.stdout


def pcm(path):
    """Mono 16-bit PCM at SAMPLE_RATE."""
    return run_ffmpeg(["-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"])


def prepare_sample(url, name):
    """The reference voice as a clean mono WAV in ComfyUI's input folder (at most 60 s); returns its length."""
    r = requests.get(url, timeout=180)
    r.raise_for_status()
    raw = os.path.join(OUT_DIR, "sample-upload")
    open(raw, "wb").write(r.content)
    dst = os.path.join(COMFY_DIR, "input", name)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    run_ffmpeg(["-y", "-i", raw, "-t", "60", "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", dst])
    return len(pcm(dst)) / 2 / SAMPLE_RATE


def join_parts(files, dst, speed=1.0):
    """The parts back to back with a short pause, at the chosen narration speed (atempo: the pitch stays the same),
    loudness-normalised, as a 192 kbps MP3. Returns its length in seconds."""
    speed = min(1.4, max(0.7, float(speed or 1.0)))
    pause = b"\x00\x00" * int(SAMPLE_RATE * PAUSE_SECONDS)
    audio = pause.join(pcm(f) for f in files)
    tempo = f"atempo={speed:.3f}," if abs(speed - 1.0) > 0.005 else ""
    run_ffmpeg(["-y", "-f", "s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-i", "-",
                "-af", tempo + "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k",
                dst], data=audio)
    return len(audio) / 2 / SAMPLE_RATE / speed


def speak(parts, sample_name, settings, language_label, seed):
    """Queues one ComfyUI prompt (all parts, the model stays loaded between them) and returns the audio files."""
    tag = uuid.uuid4().hex[:8]
    graph = {"sample": voice_node("LoadAudio", audio=sample_name)}
    for i, part in enumerate(parts):
        graph[f"tts{i}"] = voice_node(
            "FL_ChatterboxMultilingualTTS", text=part, language=language_label,
            exaggeration=float(settings["exaggeration"]), cfg_weight=float(settings["cfgWeight"]),
            temperature=float(settings["temperature"]), repetition_penalty=float(settings["repetitionPenalty"]),
            min_p=float(settings["minP"]), top_p=float(settings["topP"]), seed=int(seed),
            audio_prompt=["sample", 0], use_cpu=False, keep_model_loaded=True)
        graph[f"save{i}"] = voice_node("SaveAudio", audio=[f"tts{i}", 0], filename_prefix=f"voice/{tag}_{i:03d}")
    client_id = uuid.uuid4().hex
    ws = websocket.create_connection(f"ws://127.0.0.1:{VOICE_PORT}/ws?clientId={client_id}", timeout=30)
    r = requests.post(f"{VOICE}/prompt", json={"prompt": graph, "client_id": client_id}, timeout=120)
    if not r.ok:
        raise RuntimeError("The voice engine rejected the workflow: " + r.text[:1200])
    pid = r.json()["prompt_id"]
    started, spoken = time.time(), 0
    ws.settimeout(300)
    while True:
        if time.time() - started > 3600:
            raise TimeoutError("Speaking took longer than an hour")
        try:
            msg = ws.recv()
        except websocket.WebSocketTimeoutException:
            hist = requests.get(f"{VOICE}/history/{pid}", timeout=60).json().get(pid, {})
            if hist.get("outputs") and hist.get("status", {}).get("completed"):
                break
            if hist.get("status", {}).get("status_str") == "error":
                raise RuntimeError("The voice engine failed: " + json.dumps(hist.get("status"))[:800])
            continue
        if not isinstance(msg, str):
            continue
        event = json.loads(msg)
        kind, data = event.get("type"), event.get("data", {})
        if data.get("prompt_id") not in (None, pid):
            continue
        if kind == "executing" and str(data.get("node") or "").startswith("tts"):
            spoken = int(data["node"][3:])
            report.send("speaking", 15 + 75 * spoken / len(parts), f"Speaking part {spoken + 1}/{len(parts)}",
                        force=True)
        elif kind == "execution_error":
            raise RuntimeError(f"{data.get('node_type')}: {data.get('exception_message')}")
        elif kind == "execution_success" or (kind == "executing" and data.get("node") is None):
            break
    ws.close()
    outputs = requests.get(f"{VOICE}/history/{pid}", timeout=60).json().get(pid, {}).get("outputs", {})
    files = []
    for i in range(len(parts)):
        saved = (outputs.get(f"save{i}") or {}).get("audio") or []
        if not saved:
            raise RuntimeError(f"Part {i + 1} produced no audio")
        f = saved[0]
        files.append(os.path.join(COMFY_DIR, f.get("type") or "output", f.get("subfolder", ""), f["filename"]))
    return files


try:
    settings = JOB["settings"]
    parts = split_text(JOB["text"])
    if not parts:
        raise ValueError("There is no text to speak")
    report.send("voiceSample", 13, "Preparing the voice sample", force=True)
    sample_name = f"voice_sample_{JOB['jobId'][:8]}.wav"
    seconds = prepare_sample(JOB["sampleUrl"], sample_name)
    if seconds < 3:
        raise ValueError(f"The voice sample is only {seconds:.1f} s long; use at least 6 seconds of clear speech")
    note = f" (sample {seconds:.0f} s — 6 s or more sounds closer)" if seconds < 6 else ""
    report.send("speaking", 15, f"Speaking {len(parts)} part{'s' if len(parts) > 1 else ''}{note}", force=True)
    files = speak(parts, sample_name, settings, JOB["languageLabel"], settings.get("seed", 0))
    report.send("voiceEncoding", 92, "Joining and encoding the speech", force=True)
    out = os.path.join(OUT_DIR, f"{JOB['voiceoverId']}.mp3")
    length = join_parts(files, out, settings.get("speed", 1.0))
    for f in files:
        try:
            os.remove(f)
        except OSError:
            pass
    with open(out, "rb") as fh:
        requests.put(JOB["uploadUrl"], data=fh, headers={"Content-Type": "audio/mpeg"}, timeout=300).raise_for_status()
    minutes, secs = divmod(int(round(length)), 60)
    report.send("completed", 100, f"Voiceover ready ({minutes}:{secs:02d})", status="completed", force=True)
except Exception as exc:
    traceback.print_exc()
    report.send("failed", 0, f"{type(exc).__name__}: {exc}", status="failed", force=True)
    raise
`;

/**
 * The voice engine's set-up (ComfyUI + ChatterBox on port 8190, on a GPU with room), as Python source. The warm worker's
 * ByajBazaar AI voice lane runs this same code (quietly) to bring the engine up for the assistant.
 */
export function voiceEngineSource(): string {
  return CELL_VOICE_ENGINE.replace('__VOICE_MODEL_FILES__', () => VOICE_FILES_PY);
}

/** VOICE_MODEL_FILES as a Python list of (url, path) tuples (JSON strings are valid Python strings). */
const VOICE_FILES_PY =
  '[\n' + VOICE_MODEL_FILES.map((f) => `    (${JSON.stringify(f.url)}, ${JSON.stringify(f.path)}),`).join('\n') + '\n]';

/**
 * Kaggle voice notebook: speaks a voiceover's text in the voice of its sample with ChatterBox Multilingual (23
 * languages), the same node as in ComfyUI (FL_ChatterboxMultilingualTTS). Runs inside a warm worker session like the
 * other jobs; the model comes from the account's model cache.
 */
export function buildVoiceWorkerNotebook(job: VoiceNotebookJob): Record<string, unknown> {
  // Function replacements: a `$` in the text must not be read as a replacement pattern.
  const reporter = CELL_REPORTER.replace('__JOB_JSON__', () => JSON.stringify(JSON.stringify(job)));
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
        `# ByajBazaar voice worker\n\nAuto-generated for job \`${job.jobId}\` — do not edit. ChatterBox Multilingual TTS.`,
      ),
      code(reporter),
      code(CELL_VOICE_ENGINE.replace('__VOICE_MODEL_FILES__', () => VOICE_FILES_PY)),
      code(CELL_VOICE_RENDER),
    ],
  };
}
