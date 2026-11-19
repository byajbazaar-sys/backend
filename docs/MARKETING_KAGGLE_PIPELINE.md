# Marketing: Kaggle image & video pipeline

> **Read this first if you work on marketing images, photoshoots, logos or reels.**
> Sections 1–3 explain the idea in plain words. Sections 4 onward are the detailed reference.

## Contents

1. [What it does, in one minute](#1-what-it-does-in-one-minute)
2. [The big picture](#2-the-big-picture)
3. [The life of one job, step by step](#3-the-life-of-one-job-step-by-step)
4. [Image modes: Exact product vs Full AI scene](#4-image-modes-exact-product-vs-full-ai-scene)
5. [The image notebook](#5-the-image-notebook)
6. [The video notebook](#6-the-video-notebook)
7. [Warm workers](#7-warm-workers)
8. [The model cache dataset](#8-the-model-cache-dataset)
9. [Progress, status screens and admin](#9-progress-status-screens-and-admin)
10. [Configuration reference](#10-configuration-reference)
11. [How to… (common tasks)](#11-how-to-common-tasks)
12. [Deploy checklist](#12-deploy-checklist)
13. [Troubleshooting](#13-troubleshooting)
14. [Glossary](#14-glossary)

---

## 1. What it does, in one minute

A jeweller uploads **one product photo** (for example a bangle). ByajBazaar then makes:

- **Campaign images** — 4 advertising scenes (a model wearing it, on velvet, in a gift box…).
- **Photoshoots** — a set of product shots.
- **Logo images** — a brand backdrop with the shop name.
- **A reel** — each image becomes a 5-second video clip, merged into one Instagram Reel (1080×1920).

The AI models are too big for our AWS Lambdas, so the heavy work runs on **free Kaggle GPU notebooks**
(each Kaggle account gives a session with **2 × NVIDIA T4** GPUs and ~30 GPU hours per week). Our backend writes a
Python notebook for each job, sends it to a Kaggle account, and the notebook reports progress back.

## 2. The big picture

```
 Web app ──► Backend (NestJS on Lambda) ──► marketing DB: render job "WAITING"
                    │
                    │  dispatch
                    ▼
            Kaggle account (T4 × 2)  ◄── warm worker notebook asks "any work?" every 10 s
                    │
                    │  runs the image or video notebook code
                    ▼
            Models: Qwen3-VL (plans + judges), BiRefNet (cut-out),
                    FLUX.2 [klein] (paints), Wan 2.2 (video)
                    │
                    ├─► uploads results straight to the marketing B2 bucket (presigned URLs)
                    └─► sends progress to the backend (WebSocket, HTTPS fallback)
                                        │
                                        ▼
                            Web app updates live; files are served by
                            https://media.byajbazaar.com (see MARKETING_MEDIA_CDN.md)
```

Where the code lives:

| Path | What it is |
| --- | --- |
| `src/marketing/application/features/kaggle/service/marketing-render.service.ts` | The brain: queues jobs, starts Kaggle sessions, hands out work, handles progress events. |
| `…/kaggle/utils/image-worker.notebook.ts` | Builds the **image notebook** (Python code inside TypeScript template strings). `IMAGE_MODELS` lists its models. |
| `…/kaggle/utils/reel-worker.notebook.ts` | Builds the **video notebook** and the **account setup** notebook. |
| `…/kaggle/utils/worker-session.notebook.ts` | Builds the **warm worker** notebook (a long session that pulls jobs). |
| `…/kaggle/utils/model-cache.ts` | One list of every model file; names the per-account model cache dataset. |
| `…/kaggle/utils/kaggle-rules.ts` | Small pure rules (which notebook runs a job, cooldowns, status view). |
| `…/kaggle/service/kaggle-health.service.ts` | The health report for the admin Kaggle screen. |
| `src/marketing/infrastructure/kaggle/kaggle-worker-pool.ts` | Talks to the Kaggle API (push notebook, session status, GPU quota). |
| `src/marketing/infrastructure/persistence/` | Entities, repositories and migrations of the **separate marketing database**. |

## 3. The life of one job, step by step

Example: a user creates a campaign with 4 scenes.

1. **The user clicks "Create"** in the web app (`components/marketing/MarketingContent.tsx`). They have also picked an
   image mode (Exact product or Full AI scene).
2. **The backend saves the campaign** and creates **one `IMAGES` job per scene** (4 jobs, one shared `batchId`),
   all `WAITING` (`queueCampaignImages`). It then schedules a **dispatch** (a queue message handled by
   `marketing-queue.consumer.ts`).
3. **Dispatch spreads the jobs over the GPUs.** Idle warm workers pick jobs up by themselves within ~10 seconds. For
   every job no free worker will take, dispatch **starts a new warm worker** on the Kaggle account with the most free
   slots and GPU hours (`dispatchSessions` → `startSession` → Kaggle API "push notebook"). With 4 accounts, the 4
   scenes are painted **at the same time**.
4. **The warm worker asks for work** (`POST /api/v1/public/marketing/worker/next`). The backend claims the oldest
   waiting job for it and answers with that job's notebook code (`nextForSession` → `handToSession`).
5. **The worker runs the image notebook code**:
   - Qwen3-VL looks at the product photo once: a box around the jewellery, the **metal and enamel colours it sees**
     and, for this scene, where the product sits and a product-aware scene (one short answer).
   - In Exact mode, BiRefNet cuts the jewellery out.
   - FLUX.2 [klein] paints each scene. Qwen3-VL scores the try; only if it scores under 8 is a second try painted,
     told what to fix. The better one is kept.
   - The best image is uploaded straight to the marketing bucket.
6. **Progress flows back** after every step (`imageAnalysis`, `imageGeneration`, `imageDone`, …). The backend updates
   the campaign and pushes it to the browser, so the user sees "Painting image 2/4" and "Image 2/4: quality 9/10".
7. **The last image job finishes** (`completed`; earlier ones just update their scene). If the user asked for a video,
   **one `CAMPAIGN` job per clip** is queued (4 scenes, plus the logo clip if the brand has none yet). They also run
   in parallel, with Wan 2.2. When the **last clip job** finishes, `finishVideoJob` queues one **merge-only** job
   (ffmpeg, no video model) that joins the clips into the reel.
   The user sees one combined status per notebook ("2/4 done · Painting image…", average progress) —
   `kaggleBatchStatus` in `kaggle-rules.ts`.
8. **The worker stays warm.** It keeps the models loaded and asks for more work. With nothing to do it stops after
   the "Keep warm" time (default 45 minutes) to save GPU hours.

## 4. Image modes: Exact product vs Full AI scene

Users choose per campaign or photoshoot. Stored as `image_mode` (`exact` | `ai`, default `exact`).

| Mode | UI label | What happens | Best for |
| --- | --- | --- | --- |
| `exact` | **Exact product** (recommended) | The real jewellery is cut out; AI paints only the scene around it; the **original product pixels** are pasted back. The design, stones and metal colour can't change. | Almost everything. |
| `ai` | **Full AI scene** | FLUX.2 [klein] redraws the whole photo using the product photo as a reference. More natural light and interaction, but small details can drift. The judge marks any visible change down hard. | Lifestyle shots where a natural look matters more than exact detail. |

Logo jobs ignore the mode.

How the choice travels through the code:

1. Frontend: `components/marketing/ImageModePicker.tsx` (used in `MarketingContent.tsx` step 3 and
   `PhotoshootCreator.tsx` section 5) sends `imageMode`.
2. Request models (`create-campaign-request.model.ts`, `create-photoshoot-request.model.ts`) validate it with
   `@IsIn(MARKETING_IMAGE_MODES)` (`application/shared/enums/marketing-image-mode.ts`).
3. Services store it via `resolveImageMode()` (anything unknown becomes `exact`).
4. `marketing-render.service.ts` copies it into the job (`payload.imageGeneration.mode`) → the notebook reads
   `JOB["mode"]`.
5. Database column: migration `1700000000008-AddMarketingImageMode`.

The mobile app does not send the mode yet, so it always gets `exact`.

## 5. The image notebook

### Models

| Role | Model | Runs on |
| --- | --- | --- |
| Painter (both modes + logo backdrops) | **FLUX.2 [klein] 9B** distilled, fp8 weights (9.4 GB), fp16 maths on the T4 | ComfyUI, GPU 0 |
| klein text encoder / VAE | `qwen_3_8b_fp8mixed` (8.7 GB) / `flux2-vae` | ComfyUI, GPU 0 |
| Planner + judge | **Qwen3-VL-8B-Instruct**, 4-bit | GPU 1 |
| Cut-out | **BiRefNet** | GPU 0, before ComfyUI starts |

There are **no lighter fallback models** (no klein 4B, no Qwen3-VL 4B, no RealVisXL): every image is made by the
models above, or the job fails with a clear error.

> **Licence warning.** FLUX.2 [klein] 9B is **gated** on Hugging Face and under the **FLUX Non-Commercial License**.
> To use it, set `MARKETING_HF_TOKEN` to a read token of a Hugging Face account that has accepted the licence on
> the model page, and get a commercial licence from Black Forest Labs for business use. **The token is required:**
> without it every image job fails at once with "MARKETING_HF_TOKEN is not set" (earlier versions silently used 4B).

Why not Qwen-Image-Edit? ComfyUI only runs it in bf16/fp32. The T4 has no bf16, and fp32 for a 20B model is far
too slow and doesn't fit. klein runs in fp16 on a T4.

### The notebook's cells, in order

| # | Cell | What it does |
| --- | --- | --- |
| 1 | setup | Installs packages (a warm worker installed them at boot), opens the progress reporter, downloads the product photo, picks the mode. |
| 2 | engine | ComfyUI/klein helpers. Starts in the **background**, while the analyst works: the klein downloads (each to `<file>.part`, renamed when complete) **and**, at the same time, ComfyUI's pip install. |
| 3 | analyst | One short Qwen3-VL answer with only what the mode needs: `product_box`, `metal`, `colours` + per shot `placement` and a product-aware `scene` (Exact), or `ai_prompt` (AI). Motion prompts and product descriptions come from the backend planner. Logos skip it. |
| 4 | cutout | Exact mode: BiRefNet cuts the jewellery out **inside the box** (so hands and props stay out). AI mode: saves the box crop as the reference. |
| 5 | generate | Paints every shot, judges the tries, uploads the best one. |

### How one shot is painted

**Exact mode** (`klein_paint`):

1. Place the cut-out where the analyst said, on a plain grey canvas.
2. Give klein that canvas twice: as a **reference** (so it "sees" the product) and as the **starting image with a
   mask** (white = paint, black = keep), so the product area cannot move.
3. Prompt: "replace the grey placeholder with *<scene>*; the jewellery stays where it is, shown once".
4. Add a soft contact shadow and paste the **original product pixels** back on top.

**AI mode** (`ai_shot`): klein's standard image-edit graph — reference = product crop, prompt = `ai_prompt` with a
**metal lock** in front (`fit_metal`): "The jewellery is silver with pink and blue enamel; keep it exactly silver —
NOT gold…". For a silver/platinum piece it also rewrites "gold"/"golden" wording in the prompt (warm golden light is
what pushed silver pieces to gold).

**Keeping the metal right** (this used to turn silver jewellery gold):

1. The backend never guesses the metal. `normalizeMetal` returns `unknown` when neither the form, the inventory item
   nor the item name says it (it used to default to gold), and the prompt then says "the exact metal colour seen in
   the reference photo". For silver/platinum the scene light is neutral instead of "warm golden".
2. The analyst reads the metal from the photo, and the photo wins over the direction.
3. The judge names the metal it sees in each try; a silver piece that came out gold scores at most 2.

**Worn shots** describe the piece physically on the body ("her hand passes through it and it rests on the wrist
bone… not held, not floating"); the judge reports `worn`, and a piece held or floating beside the body scores at
most 4. In Exact mode the original pixels are pasted, so a worn shot can still look stuck-on; use AI mode for sets
with a model.

**Logo** (`klein_logo`): klein paints a backdrop with an emblem, then the shop name is **typeset with a real font**
(never AI-drawn), so it is always spelled correctly.

klein settings: 4 steps, euler, cfg 1.0 (what the distilled model is trained for). A blank/black image (an fp16
overflow) restarts ComfyUI once with a full-precision text encoder.

### How the two GPUs share the work

```
GPU 0 (klein paints)     try 1 ─────────────── (only if try 1 < 8) try 2 with "Avoid this mistake: <issue>"
GPU 1 (Qwen3-VL judges)          judge 1                                    judge 2
```

- **At most 2 tries per shot** (1 if the session only has one GPU — then there is no judge). It used to be up to 4;
  most of that time was spent on tries nobody saw.
- Why judge at all with the best model? Every try is a random sample: even 9B sometimes gets a hand, the scale or
  the metal wrong. The judge catches that before it reaches the user.
- Try 1 is judged first; a score of **8 or more** is kept straight away. Otherwise try 2 is painted with the judge's
  complaint added to the prompt, so it fixes that specific mistake instead of rolling the dice again.
- The judge is strict (0–10): product shown once, natural size and placement, no halo or cut-out look, matching
  shadow, correct hands and faces, looks like a real camera photo, no text. In AI mode any visible change to the
  product caps the score at 4; a changed metal at 2; a worn shot that isn't worn at 4.
- If both tries are within 1 point, Qwen3-VL compares them side by side. Only the best try is uploaded.

We don't run a second painter on GPU 1 because Kaggle gives ~30 GB of RAM: two copies of klein plus Qwen3-VL would
run out of memory.

### When klein fails

There is no lower-quality fallback. If the image engine can't start, the job fails with the ComfyUI error (and is
retried by the watchdog when the session died). If one try fails after the engine started, only that try is lost.

### How long it takes

About 1–3 minutes per try with 9B, so one scene takes ~2–6 minutes. Scenes run in parallel on different accounts, so
a 4-scene campaign takes about as long as one scene **when 4 accounts are free** (otherwise scenes queue for the next
free worker). A brand-new session adds model loading (a few minutes from the model cache, longer when downloading); a
warm worker starts the next job at once.

## 6. The video notebook

Wan 2.2 TI2V-5B (in ComfyUI) turns each image into a ~5-second clip; ffmpeg merges the clips into a
1080×1920, 30 fps H.264 reel with smooth transitions.

| Preset | Render size | Frames | Steps |
| --- | --- | --- | --- |
| `reel_hq` | 704×1280 (Wan 2.2's native portrait size) | 121 at 24 fps | 30 |
| `reel_fast` | 480×832 | 121 at 24 fps | 20 |

Clips are upscaled to 1080×1920 afterwards, so `reel_fast` is softer but cheaper.

Setup overlaps: ComfyUI's pip install runs in the background while the Wan files download (in a warm worker it was
already done at boot). The video prompt and negative prompt lock the metal and enamel colours ("silver turning gold"
is in the negative), since a clip starts from the scene image and must not drift away from it.

**Out-of-memory protection** (this used to crash with "KSampler: Allocation on device 0 would exceed allowed memory"):

- Frames are decoded in tiles (`VAEDecodeTiled`), not all at once.
- ComfyUI keeps 1 GB of GPU memory in reserve.
- If a clip still runs out of memory, `render_clip_safely()` retries smaller: 704×1280 → 608×1088 → 544×960 → 480×832.
- With two GPUs, both T4s work on every step (`C2CSequenceParallel`).

Long jobs hand over before Kaggle's 12-hour session limit: finished clips are kept and the job continues in a new
session.

## 7. Warm workers

### Why

Starting a Kaggle session from scratch takes many minutes (install packages, download ~50 GB of models, load them).
A **warm worker** is one long Kaggle session that does this once and then runs job after job.

### How it works, step by step

1. **Start.** Dispatch pushes the worker notebook (`buildWorkerSessionNotebook`) to a Kaggle account. In the database
   it is a render job of kind `WORKER` that holds one slot of that account.
2. **Boot.** The notebook links the account's model cache dataset (section 8) into place, so nothing downloads.
   Then two **background threads** start, so the first job doesn't do this work itself:
   - pip installs the image packages and ComfyUI's requirements;
   - every cached model file is copied from the read-only dataset mount (`/kaggle/input`) to the local disk
     (`/tmp`), in the order a job needs them (Qwen3-VL, BiRefNet, klein, then Wan). Each copy goes to
     `<file>.staging` and is then renamed over the symlink, so nothing ever reads a half-written file. Later loads,
     and reloads after switching between image and video work, read the fast local disk. Files that would leave less
     than 12 GB free stay on the mount.

   A job that needs a step that hasn't finished waits for it ("Copying the image analyst to the local disk"); the
   Kaggle log shows `Boot: … installed in …s` and `Boot: N model files copied to the local disk in …s`.
3. **Ask for work.** Every 10 s it calls `POST /api/v1/public/marketing/worker/next` (this is also its heartbeat).
4. **Run a job.** The answer contains the job's notebook code. The worker runs it in-process. A `WORKER` dictionary
   survives between jobs and keeps the loaded Qwen3-VL, the running ComfyUI and the installed packages — so the
   second image job skips installing, downloading and loading.
5. **Switch pipelines.** Before switching between image and video work, it stops ComfyUI and drops Qwen3-VL (both
   pipelines need both GPUs).
6. **Stop.** It exits when the backend tells it to (see idle rules below), and reports `completed`.

### When does a new worker start?

Dispatch (`dispatchSessions`) counts waiting jobs and free workers (idle or still booting). For every waiting job
that no free worker will take, it starts a new worker straight away. So:

- 1 worker idle, 1 job arrives → the idle worker takes it within ~10 s. Nothing new starts.
- 1 worker busy, 1 job arrives → a second worker starts immediately.

### When does a worker stop? (idle rules)

Set in the admin panel → Kaggle → **Keep warm** (`warmIdleMinutes`, default 45, `0` = off):

- The idle worker with the most Kaggle session time left stays warm for that long, then stops.
- Any other idle worker stops after 5 minutes (only one is kept warm).
- A worker with less than 45 minutes of Kaggle session time left stops; a fresh one starts if work is waiting.
- A worker on an account that is cooling down or out of GPU hours stops.

Always-on is not possible: 4 accounts × 30 GPU hours/week = 120 hours, but one session running all week needs 168.

### When something goes wrong

| Situation | What happens |
| --- | --- |
| Worker never reports in within 25 min | It is closed; the account rests if Kaggle kept it queued. |
| Idle worker stops polling for 5 min | It is closed and its slot is freed. |
| Worker dies during a job | The job is re-queued (up to 4 times) and the worker is closed. |
| Job crashed with an error | The job fails with that error; the worker carries on. |
| Job finished but its last event never arrived | After a 2-minute grace the job is re-queued. |

**Turned off when** `MARKETING_API_BASE_URL` is empty — then each job pushes its own notebook (the old way).

## 8. The model cache dataset

### Why

Kaggle wipes `/tmp` when a session ends, so models downloaded in one session are gone in the next. Instead, the
**account setup** notebook saves all models (~55 GB with 9B) as a **private Kaggle dataset** on each account. Warm
workers **mount** it (instant, no download).

### How it works, step by step

1. The dataset name is `<kaggle-user>/byajbazaar-models-<hash>`. The hash is made from the model list
   (`modelCacheContents` in `model-cache.ts`), so changing a model gives a new name, and
   every account rebuilds automatically.
2. **New accounts** build it during setup. The account is marked ready first (`accountReady` event), so it can render
   while the cache builds.
3. **Existing ready accounts** without the current dataset get a "cache-only" setup job (retried at most every 6 h).
4. The setup notebook downloads every file, then uploads them with the `kaggle` CLI using **that account's own key**
   (it is put into the private setup notebook), waits until Kaggle finishes processing, and reports the dataset name.
5. The name is saved in `kaggle_accounts.models_dataset` (migration `1700000000009`). The account card shows
   **"models cached"**.
6. Warm workers are pushed with the dataset mounted. If Kaggle refuses that (dataset missing or still processing),
   the push is retried without it and the notebooks download as before.

A failed cache build never disables an account; it is logged as `KAGGLE_MODEL_CACHE_FAILED`.

## 9. Progress, status screens and admin

- Notebooks send `marketingProgress` events over the AWS WebSocket (`JOB["wsUrl"]`). If the socket is down they
  `POST /api/v1/public/marketing/worker-events` (same body).
- Every event carries a **per-job token** (`signMarketingWorkerToken`), so a notebook can only report for its own job.
- Image stages: `imageSetup` → `imageAnalysis` → `imageCutout` → `imageGeneration` → `imageReview` →
  `imageDone` / `imageFailed` → `completed` / `failed`.

Screens:

| Screen | File | Shows |
| --- | --- | --- |
| Campaign / photoshoot (users) | `components/marketing/KaggleNotebookStatus.tsx` | Image and video notebook status, progress, elapsed time. |
| Admin → Kaggle (`/admin/kaggle`) | `components/admin/kaggle/*` | Accounts, GPU hours, slots, warm worker state, model cache, both pipelines, recent runs, "Keep warm" and "Auto-recover" settings. |

Admin API: `src/marketing/application/features/kaggle/marketing-admin.controller.ts`
(`/api/v1/marketing/admin/kaggle-credentials/...` — add/verify accounts, health, settings, restart a job).

## 10. Configuration reference

Set in `.env.<stage>` (all `MARKETING_*` and `KAGGLE_*` values are shipped to the Lambdas through one SSM parameter
by `serverless/marketing-config.js`).

| Variable | Needed? | What it does |
| --- | --- | --- |
| `MARKETING_API_BASE_URL` | Yes (prod) | Public API address, e.g. `https://…execute-api.ap-south-1.amazonaws.com` (no path, no trailing slash). Warm workers pull jobs from it; notebooks fall back to it for progress; QStash calls it. Empty → no warm workers. |
| `WEBSOCKET_API_URL` | Yes | `wss://…` address the notebooks stream progress to. |
| `MARKETING_WORKER_SECRET` | Recommended | Signs the per-job / per-worker tokens (falls back to `TOKEN_SECRET`). |
| `MARKETING_HF_TOKEN` | **Yes** | Hugging Face read token of an account that accepted the FLUX.2 [klein] 9B licence. Empty → image jobs fail, and the model cache is not built. |
| `MARKETING_MEDIA_CDN_URL` | Recommended | `https://media.byajbazaar.com` — see `MARKETING_MEDIA_CDN.md`. Empty → signed B2 URLs. |
| `MARKETING_S3_*` | Yes | The marketing bucket (Backblaze B2). |
| `MARKETING_DB_*` | Yes | The separate marketing database. |
| `KAGGLE_SESSION_HOURS` | No (12) | Kaggle's session limit; jobs hand over before it. |
| `KAGGLE_MACHINE_SHAPE` | No | Kaggle accelerator (default T4 × 2). |

Kaggle **accounts are not env vars** — admins add them on `/admin/kaggle` (keys stored as plain text in `kaggle_credentials.api_key`; keys saved before migration `1700000000010` are decrypted and rewritten on first read).

Admin settings (stored in the marketing DB): **Auto-recover** and **Keep warm** (minutes).

## 11. How to… (common tasks)

### …add a Kaggle account

1. On kaggle.com: verify the phone number (needed for GPUs), then Settings → API → create a token.
2. In ByajBazaar: `/admin/kaggle` → **Add accounts** → username + token (and "Parallel renders").
3. The backend checks the key, then runs the **setup** notebook (GPU check, model check, model cache). The card shows
   "Setting up" → "Ready" → later "models cached".

### …change or add a model

1. Change the URL in `IMAGE_MODELS` (`image-worker.notebook.ts`) or `VIDEO_MODEL_FILES` (`model-cache.ts`).
2. If it is a ComfyUI file, its folder/file name comes from the URL — check `klein_workflow()` / the video graph uses
   the right node inputs.
3. The model cache name changes automatically → every account rebuilds its cache once.
4. Test the generated notebook locally (next task), deploy, and run one job.

### …change what the AI is told (prompts)

- Scene planning: `PLAN_INSTRUCTIONS` in the analyst cell (`image-worker.notebook.ts`).
- Judge rules: `judge()` in the generate cell.
- Exact-mode painting prompt: `klein_paint()`; AI mode uses the analyst's `ai_prompt`.

### …check a notebook change before deploying

The notebooks are Python inside TypeScript strings, so a typo only shows up on Kaggle. Build the notebook locally and
compile it:

```bash
cd Backend
# The script must live inside Backend/ so its ./src import resolves; it is deleted at the end.
cat > build-nb.tmp.ts <<'EOF'
import { writeFileSync } from 'fs';
import { buildImageWorkerNotebook } from './src/marketing/application/features/kaggle/utils/image-worker.notebook';
const nb: any = buildImageWorkerNotebook({ jobId: 'test', token: 't', wsUrl: 'wss://x', type: 'campaign', mode: 'exact',
  title: 'Test', targets: [{ index: 0, kind: 'scene', prompt: 'on velvet', uploadUrl: 'https://x', width: 720, height: 1280 }] } as any);
writeFileSync('/tmp/image.py', nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source).join('\n'));
EOF
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' npx ts-node --transpile-only build-nb.tmp.ts
python3 -m py_compile /tmp/image.py && echo "image notebook OK"
rm build-nb.tmp.ts
```

Do the same with `buildWorkerNotebook` (video / setup) and `buildWorkerSessionNotebook` (warm worker).

### …see what a notebook is doing

`/admin/kaggle` → the account card → **Open on Kaggle**. The notebook log shows every step
(`=== job … finished in 3.1 min`). For ComfyUI errors look for `/tmp/comfyui-image.log` in the output.

## 12. Deploy checklist

1. Set the variables in section 10 in `.env.production`.
2. `yarn sls:deploy:production` — builds, deploys and runs post-deploy, which applies the marketing migrations
   (`1700000000008` image mode, `1700000000009` model cache).
3. Deploy the frontend (image mode picker, status and admin screens).
4. On `/admin/kaggle`, check every account is **Ready**. Existing accounts start a one-time model cache build
   (about an hour of GPU time each) — wait for **models cached**.
5. Run one photoshoot, then a second one right after: the second should start without "Installing…" / "Loading the
   image analyst" (warm worker).

## 13. Troubleshooting

| Symptom | Likely cause → fix |
| --- | --- |
| Product pattern changes between scenes, blurry bands | An old notebook is deployed. Redeploy the backend. |
| `Hugging Face refused …` | The `MARKETING_HF_TOKEN` account hasn't accepted the klein 9B licence, or the token is wrong. |
| `MARKETING_HF_TOKEN is not set` | Add the Hugging Face token to `.env.production` and deploy the backend. |
| `ComfyUI exited` / `ComfyUI failed` | klein could not start. Look at `/tmp/comfyui-image.log` in the Kaggle output. |
| `ComfyUI has no <Node> node` | ComfyUI is cloned fresh each session; rerun. If it persists, the node was renamed upstream. |
| `<Node> has no input [...]` | ComfyUI changed a node's inputs; update `klein_workflow()`. |
| `FLUX.2 [klein] produced a blank image` | fp16 overflow even after the restart; rerun (new seed). |
| Video still runs out of memory at 480×832 | Something else holds GPU memory; check the account's GPU info on the admin card. |
| Card never shows "models cached" | Read the setup job message (`model cache not built: …`): Kaggle dataset storage limit, or the `kaggle` CLI couldn't log in with the account key. |
| Two warm workers idle | Normal for up to 5 minutes; only one is kept warm. |
| Jobs wait but nothing starts | `/admin/kaggle` health issues: accounts resting, out of GPU hours, or failed setup. Use **Restart Kaggle**. |
| Every try scores low | Weak product photo (busy background, tiny product). The cut-out and plan depend on it. |

## 14. Glossary

| Term | Meaning |
| --- | --- |
| **Render job** | A row in `marketing_render_jobs`: `IMAGES`, `CAMPAIGN` (video), `LOGO`, `SETUP` or `WORKER`. Status `WAITING` → `STARTING` → `RUNNING` → `DONE` / `FAILED`. |
| **Dispatch** | The step that matches waiting jobs to Kaggle capacity (starts warm workers). |
| **Slot** | One concurrent Kaggle session on an account (the account's "parallel renders" setting). |
| **Warm worker** | A long Kaggle session (`WORKER` job) that keeps models loaded and pulls jobs. |
| **Take / try** | One attempt at painting a shot (at most 2); the judge keeps the better one. |
| **ComfyUI** | The open-source engine that runs klein and Wan graphs inside the notebook. |
| **klein** | FLUX.2 [klein] 9B, the image model (needs `MARKETING_HF_TOKEN`). |
| **Batch** | Jobs queued together (one per scene, shot or clip) that run in parallel and show as one status. |
| **Model cache** | The private Kaggle dataset with every model, built once per account. |
| **Exact / AI mode** | The user's image choice: keep the real product pixels, or redraw everything. |
