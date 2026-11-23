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
   - [6a. The voice notebook](#6a-the-voice-notebook-voiceovers)
   - [6b. The fast video notebook](#6b-the-fast-video-notebook-fast-render)
7. [Warm workers](#7-warm-workers)
8. [The model cache dataset](#8-the-model-cache-dataset)
   - [8a. Colab Enterprise accounts](#8a-colab-enterprise-accounts)
9. [Progress, status screens and admin](#9-progress-status-screens-and-admin)
10. [Configuration reference](#10-configuration-reference)
11. [How to… (common tasks)](#11-how-to-common-tasks)
12. [Deploy checklist](#12-deploy-checklist)
13. [Troubleshooting](#13-troubleshooting)
14. [Glossary](#14-glossary)

---

## 1. What it does, in one minute

A jeweller uploads **one product photo** (for example a bangle). ByajBazaar then makes:

- **Campaign images** — 5 advertising scenes (on velvet, on a bust or stand, in a gift box…).
- **Photoshoots** — 4 catalogue photos: in a gift box, a close-up, on its display, a flat lay.

**Everything shows the jewellery only — no model, no hands** (see "Jewellery only" below).
- **Logo images** — a brand backdrop with the shop name.
- **Reels** — each scene image becomes its own 5-second video clip (1080×1920), publishable as an Instagram Reel.

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
7. **Each scene's clip is queued the moment its image is ready** (`renderSceneEarly`, when the user asked for video):
   one `CAMPAIGN` job per clip, so a free GPU starts on scene 1's video while scenes 2–5 are still painting. The last
   image job queues whatever is left (and the logo clip if the brand has none yet). Each clip is a deliverable:
   **there is no merge step** any more (it cost a whole extra GPU-session hand-off and a re-encode of every clip). A
   reel is published from one scene clip; campaigns made earlier keep their merged film.
   The user sees one combined status per notebook ("2/4 done · Painting image…", average progress) —
   `kaggleBatchStatus` in `kaggle-rules.ts`.
8. **The worker stays warm.** It keeps the models loaded and asks for more work. With nothing to do it stops after
   the "Keep warm" time (default 45 minutes) to save GPU hours.

## 4. Image modes: Exact product vs Full AI scene

Users choose per campaign or photoshoot. Stored as `image_mode` (`exact` | `ai`, default `exact`).

| Mode | UI label | What happens | Best for |
| --- | --- | --- | --- |
| `exact` | **Exact product** (recommended) | Surface shots (velvet, plinth, box on a table): the real jewellery is cut out, AI paints only the scene around it and the **original product pixels** are pasted back — they can't change. On-body shots (worn, held in hands, presented in a box, a campaign scene with a model): a flat photo can't be worn, so klein draws the piece in place and the **real pixels are restored on top** wherever the drawing matches (see "Generate, then restore"). | Almost everything. |
| `ai` | **Full AI scene** | Every shot is drawn by FLUX.2 [klein] from the clean cut-out, then the real pixels are restored on top the same way. More natural light and interaction. | Lifestyle sets. |

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

| Role | Model | Runs on | Licence |
| --- | --- | --- | --- |
| Painter (both paths + logo backdrops) | **FLUX.2 [klein] 9B** distilled, fp8 weights (9.4 GB), fp16 maths on the T4 | ComfyUI, GPU 0 | FLUX Non-Commercial (see warning) |
| klein text encoder / VAE | `qwen_3_8b_fp8mixed` (8.7 GB) / `flux2-vae` | ComfyUI, GPU 0 | Apache-2.0 |
| Planner + judge | **Qwen3-VL-8B-Instruct**, 4-bit | GPU 1 | Apache-2.0 |
| Cut-out | **BiRefNet_HR** at 2048 px, aspect kept | GPU 0, before klein loads | MIT |
| Product restore | SIFT + MAGSAC homography + detail transfer (OpenCV) | CPU | Apache-2.0 / BSD |

There are **no lighter fallback models**: every image is made by the models above, or the job fails with a clear
error.

> **Licence warning.** FLUX.2 [klein] 9B is **gated** on Hugging Face and under the **FLUX Non-Commercial License**
> (verified on the model card, Nov 2026). Serving it to paying jewellers needs a commercial licence from Black Forest
> Labs (their "Builder" self-hosted tier covers klein; read its "no external API endpoint" clause). FLUX.2 [klein]
> **4B** is Apache-2.0 and runs the same graph; it is the licence-safe switch if no BFL licence is bought — with the
> restore step it loses less, since the jewellery's pixels come from the photo either way. Set `MARKETING_HF_TOKEN`
> to a read token of an account that accepted the 9B licence; without it every image job fails at once.

Why not Qwen-Image-Edit-2509/2511, FireRed-Image-Edit, FLUX 3 Image Klein or LTX-2? ComfyUI runs those classes only in
bf16/fp32. A T4 has no bf16, so they fall back to fp32 (about 3.5x slower on Turing) and the 20B ones don't fit;
nunchaku's INT4 Qwen kernels crash on sm_75. klein's ComfyUI class runs in fp16, which the T4 does well.

### The notebook's cells, in order

| # | Cell | What it does |
| --- | --- | --- |
| 1 | setup | Installs packages (a warm worker installed them at boot), opens the progress reporter, downloads the product photo, picks the mode, reads the jeweller's metal (`JOB.metal`). |
| 2 | restore | The shared CPU helpers (`product-restore.notebook.ts`): `product_features`, `match_product`, `restore_product`, `refine_foreground`, `metal_tone`. |
| 3 | engine | ComfyUI/klein helpers; klein downloads + ComfyUI's pip install in the background. Then a **GPU-0 thread** cuts the photo out with BiRefNet_HR and loads klein (a tiny warm-up render) **while the analyst works on GPU 1**. |
| 4 | analyst | One Qwen3-VL answer: `product_box`, `metal`, `colours` + per shot either `placement` + `scene` (paste shots) or `ai_prompt` (redraw shots). The JSON template uses placeholders, never example values the model could copy. A metal given by the jeweller wins over what it reads. Logos skip it. |
| 5 | cutout | Keeps the mask parts inside the analyst's box (hands and props dropped; the opening of a kada is never filled), cleans the edge colours (no halo), builds the SIFT features, and saves the cut-out on a soft neutral backdrop as klein's reference. |
| 6 | generate | Paints every shot, restores the real product, judges, uploads the still **and its product mask** (`<image>-mask.png`). |

### How one shot is painted

Every shot takes one of two paths (`path_for`):

**Paste** (exact mode, surface shots — `paste_shot`):

1. Place the cut-out where the analyst said, on a plain grey canvas (never larger than 1.5x its photographed pixels),
   with a soft shadow just under it, and tell klein the piece rests on the surface right beneath it. Without the
   shadow a ring left in mid-air got a plinth painted lower down — with a second ring of klein's own on it.
2. Give klein that canvas twice: as a **reference** and as the **starting image with a mask** (white = paint,
   black = keep), so the product area cannot move.
3. Upscale the painted scene to the deliverable size (long side 1920) and paste the **source-resolution cut-out**
   on top with a soft contact shadow.

A piece the product photo **cuts off** (a long chain photographed in part, running off the bottom edge) is pasted so
it runs off the same edge of the frame (`cut_sides` on the cut-out mask; the layer's cut side sits on the frame's
edge). Pasted whole, its flat-cut ends looked like a broken chain on the velvet.

The analyst also says how the photo shows the piece (`view`): **flat** (laid flat and seen from above, or hanging
and seen face-on — necklaces, chains, tikkas, payals, coins) or **angled** (rings, bangles, kadas). A flat piece's
paste scenes become a **flat lay seen from directly above** (`flat_lay`), unless the scene already puts it on a bust
or a stand: a face-on necklace pasted onto a thali seen at an angle stood up on it like a sculpture.

**Redraw** (ai mode, and every on-body shot — `redraw_shot`): klein draws the whole photo from the clean cut-out
with the **metal lock** in front of the prompt (`fit_metal`: "The jewellery is silver with pink and blue enamel; keep
it exactly silver — NOT gold…"; gold wording is rewritten for white metals). Then **generate, then restore**:

1. `match_product` finds the drawn piece: SIFT features of the real cut-out matched in the drawing, a MAGSAC
   homography, and sanity checks (enough consistent matches, convex placement, limited distortion).
2. `restore_product` rebuilds it from the real photo: fine detail (bells, enamel edges, engraving) and colour from the
   photo, only the soft large-scale light from the drawing, and a small white-balance shift at most.
3. A local agreement map keeps the drawn pixels wherever the two disagree — fingers in front of the piece, the back
   of a bangle hidden by the wrist — so nothing is pasted over a hand.
4. If less than 45% of the piece agrees (a very different pose), the drawing stays and the judge decides; the metal
   is still measured in CIELAB on the matched area.

Tested on the real silver kada: a take tinted gold (b* 34) comes back silver (b* ~11, photo 8) with a finger kept in
front; a piece the video model rotated is correctly refused.

**Keeping the metal right** (this used to turn silver jewellery gold):

1. The backend never guesses the metal (`normalizeMetal` returns `unknown`); a photoshoot's known metal is sent as
   `JOB.metal` and wins.
2. The analyst reads the metal from the photo; the prompt carries the metal lock.
3. The restore puts the photo's colour back; the judge's metal answer and the CIELAB measurement cap a changed metal
   at 2/10.
4. The jeweller's title wins over a misread photo when they disagree on the family: "Gold Chain Bracelet with Agate"
   read as silver (an antique, brownish gold) is locked as gold (`title_metal`). Same family ("Silver Coin" read as
   oxidised silver) keeps the analyst's finer word.
5. **Oxidised** pieces get their own lock ("a dark, blackened antique silver finish… NOT bright polished silver"):
   "white-grey" made klein polish them bright. A redrawn take the judge reads as plain silver scores at most 5.

**Worn shots** describe the piece physically on the body ("her hand passes through it and it rests on the wrist
bone… not held, not floating"); the judge reports `worn`, and a piece held or floating scores at most 4.

**Logo** (`klein_logo`): klein paints a backdrop with an emblem, then the shop name is **typeset with a real font**
(never AI-drawn), so it is always spelled correctly.

klein settings: 4 steps, euler, cfg 1.0 (what the distilled model is trained for). A blank/black image (an fp16
overflow) restarts ComfyUI once with a full-precision text encoder.

### Jewellery only (no models, no hands)

Marketing photos and reels show the jewellery alone, everywhere:

- **Campaigns**: the five scenes of each style are product scenes (the old model scene became a bust, a stand or a
  display shelf in the same mood). The scene writer's instructions and its filter allow no person or body part
  (`hasPeople`).
- **Photoshoots**: the shots are `box` (open gift box on the setting's counter), `closeup` (macro on its surface),
  `display` (on the display the piece is sold on — bust, earring stand, ring cone, bangle stand or tray) and
  `flatlay` (from above with a few props). The model and outfit options are no longer asked for; the API still
  accepts them from older apps and ignores them.
- **Older work**: a campaign scene planned with a model, or a photoshoot's model / gloved-hands / worn shot, is made
  as the jewellery-only shot in its place when it is regenerated (`productOnlyScene`, `productShotKind`; the new
  direction is saved). Existing images stay as they are until then.
- **The image notebook enforces it** (`PEOPLE`, off unless a job sends `allowPeople`, which none does): every shot
  is product-only, exact mode pastes the real cut-out into every shot, an analyst plan that names a person falls back
  to the direction, and a direction that still names one becomes the piece on its display. The judge caps any take
  with a person or hand at 3.

The model-shot rules below (categories, staging, wearer, re-staging) are kept for jobs that would allow people; with
`PEOPLE` off they never run.

### Jewellery categories (who wears it, where, and how the model shot is framed — only with `allowPeople`)

The model scene of a campaign is staged from the piece's kind, read from the jeweller's title (else the analyst's
name for the piece): the head noun wins ("Gold Nose Ring" is a nose piece, "Silver ghungroo bangles set" a wrist
piece), "set" only counts when nothing else matches, and "… with …" clauses are ignored. Every category of the
catalogue maps (checked on all 119 names in the gold and silver lists):

| Worn on | Kinds (examples) | Model shot |
| --- | --- | --- |
| finger | rings, bands, solitaire, cocktail, engagement, couple rings | close-up of the hand, ring large |
| wrist | bangles, kada, chooda, bracelets, cuffs | forearm across the body at chest height |
| upper arm | bajuband, armlet, vanki | waist-up, arm relaxed |
| hand | hathphool / hand harness | close-up of the hand |
| neck | necklaces, chains, pendants, lockets, haar, choker, mangalsutra, sets | chest-up |
| ear | studs, tops, jhumka, bali, hoops, drops, chandbali, ear cuffs, ear chains | three-quarter portrait |
| nose | nose pins, nose rings, nath (chain to the hair) | close portrait |
| forehead / hair | maang tikka, borla, matha patti; passa, jhoomar, hair pins, juda | close / three-quarter portrait |
| ankle / toe | payal, anklets, ghungroo; bichiya / toe rings | close-up of the feet |
| waist | kamarband, waist belt | chest to knees |
| held | coins | cupped hands, close-up (wearing words — "worn by", "as a pendant" — become holding ones) |

**Photoshoot shots with people (old kinds, only with `allowPeople`) are staged by kind** (`shot_staging`): *worn* is on the body as in the table; *hands* is only the
two gloved hands holding it (nobody wears it); *present* is the model holding it out in the open box (wearing no copy
of it). The analyst's brief, the sentence every take is painted with, and the judge all follow it: a hands or present
take where the piece is also worn scores at most 3, a worn take where it is held scores at most 4. Treating hands and
present shots as worn had painted the chain on the neck *and* in the gloves or box, and capped every correct take. A
photoshoot's model is the jeweller's choice (`wearer` from the man / woman option), never the analyst's guess, and
every model shot says the rest of the body is bare (no added earrings, rings or bangles).

Rules on top: **kids' / baby** pieces never get a child model — their model scene becomes a soft product shot (baby
blanket, wooden toy); **couple** pieces show a man's and a woman's hands together (no single-wearer or gender
check); the wearer's gender comes from the title when it says so (gents / men's; ladies, bridal, mangalsutra, nath,
payal, borla, passa, chooda…) and otherwise from the analyst. The judge reports where the piece is worn
(`worn_on`) and how many pieces of the kind it sees (`pieces`, against the photo's own count — a pair of payals
stays two): a ring hung on a necklace, or a second drawn copy of the piece, caps the take at 3. When the long
question reads the place wrongly (an armlet high on the arm read as "wrist"), one short yes / no question
(`confirm`) decides before the take is capped — only for such near misses (`CONFUSABLE`: upper arm / wrist, a matha
patti set / waist, toe / ankle…); a nose ring drawn as a necklace stays capped. Every paste take also gets the copy
finder's look (not only those the judge flags): plainer extra rings klein painted beside toe rings had passed the
judge.

### How the two GPUs share the work

```
GPU 0   BiRefNet_HR cut-out ── klein warm-up ── try 1 ──────────── (only if try 1 < 8) try 2
GPU 1   Qwen3-VL plans the shots ─────────────────── judge 1 ───────────────────────── judge 2
CPU     photo download · restore + CIELAB check of each try · JPEG / mask upload
```

- While the analyst plans on GPU 1, GPU 0 cuts the piece out and loads klein, so the first try starts right after.
- **2 tries per shot** (1 without a second GPU — then there is no judge), and a **third** when neither scored above
  4 (a clear failure: a duplicate, the wrong body part, a different piece). Try 1 is judged first; **8 or more** is
  kept straight away. Otherwise try 2 is painted with the judge's **positive** fix ("Show the silver kada resting on
  velvet…" — negations in the prompt do nothing at cfg 1).
- **A copy painted beside the real piece is painted out, not repainted.** When a paste take is good (the judge's
  own score 6+) and capped only for a duplicate or extra jewellery, the judge lists a box for every copy it sees;
  the boxes away from the placed piece are repainted by klein as plain scene (`clean_copies`), every other pixel —
  the real product above all — stays as it was, and that cleaned take is judged as the next try. A fresh take
  tended to paint the copy again (three tries in a row on one ring scene).
- **A campaign model scene that never kept the real piece is shown on its display.** When every model take of an
  exact-mode campaign scored 4 or less (klein drew a different design, or put it on the wrong body part), the scene
  is re-staged as the real cut-out on the display the piece is shown on (bust, ring cone, bangle stand, coin tray…)
  in the campaign's mood, and judged with takes of its own. A model wearing a different piece is no advert for the
  jeweller's. `imageDone` then carries `scenePrompt` (the re-staged scene) and a product `motionPrompt`; the backend
  stores them on the scene, so its clip prompt no longer asks for a model. Kids' pieces (model scene re-staged
  before painting) report the same way.
- The judge sees the reference cut-out, the take, and a **close-up of the located piece**. Hard limits its overall
  number can't override: changed metal (measured or read) → 2; extra jewellery → 3; worn piece held/floating → 4;
  a redraw whose piece can't be found in it → 6. A judge that fails twice gives 5 (so a second try is made). An
  answer cut off at its token limit keeps every field it wrote in full (`parse_json`) instead of failing.
- If both tries are within 1 point, Qwen3-VL compares them side by side. Only the best try is uploaded.

We don't run a second klein 9B on GPU 1: two copies of 9B + its 8B text encoder don't fit Kaggle's ~29 GB of RAM
(two klein 4B would).

**Cut-out reuse (warm sessions).** Each scene of a campaign is its own image job on the same product photo. The
session keeps the cut-out of the last 4 photos, keyed by a hash of the photo's bytes.

- On the next job with that photo it skips BiRefNet. In a warm session BiRefNet first has to unload klein from
  GPU 0, so this also saves the klein reload.
- The closer second pass is reused when the analyst's box is about the same (IoU ≥ 0.85); otherwise only that pass
  runs again.
- The output is unchanged: the same photo gives the same mask.

**Several shots per job are pipelined.** A warm session takes the batch's other waiting shots into the job it starts
(up to 4), unless other idle or booting sessions would take them.

- In the job, GPU 0 paints the next shot, or a second take, while GPU 1 judges the last.
- Every shot keeps exactly its own takes, judging and fix-guided second take; second takes go before new shots.
- A painter thread that dies, or an engine that never starts, fails the shots instead of hanging the job.
- In the 3-shot test, painting and judging overlapped, and only the weak shot got a second take.

**Robustness**:

- The photo download and the image / mask uploads retry with backoff; an expired URL fails at once.
- A crashed ComfyUI is restarted once and the same render tried again; ComfyUI is polled every 0.5 s (was 2 s).
- Painted PNGs are deleted after reading, so a 12-hour warm session doesn't fill the disk.

### When klein fails

There is no lower-quality fallback. If the image engine can't start, the job fails with the ComfyUI error (and is
retried by the watchdog when the session died). If one try fails after the engine started, only that try is lost.

### How long it takes

About 1–3 minutes per try with 9B (estimate from earlier runs; measure the logged timings), the restore adds 1–3 s
of CPU, so one scene takes ~2–6 minutes. Scenes run in parallel on different accounts. A warm worker starts the next
job at once; a new session's first job no longer waits for klein to load after the analyst.

## 6. The video notebook

**Wan 2.2 I2V A14B** (Apache-2.0) turns each scene still into a ~5-second, 1080×1920, 30 fps H.264 clip — each one
a reel of its own. (It replaced Wan 2.2 TI2V-5B, whose 16x-compressing VAE melted
bells and enamel and whose clips drifted — see `videos test/`.)

| Part | Setting |
| --- | --- |
| Model | two 14B experts as GGUF **Q5_K_M** (10.8 GB each): high-noise lays out the motion, low-noise the detail |
| Speed-up | **LightX2V 4-step I2V distill LoRAs** (Apache-2.0) on both experts, strength 1.0 |
| Sampler | euler / simple, shift 5, **CFG 1** — half the steps on each expert (`KSamplerAdvanced` ×2) |
| VAE / text | **Wan 2.1 VAE** (A14B needs it; the 2.2 VAE is for 5B only) / umT5-XXL fp8 |
| Frames | 81 at 16 fps (Wan's native rate) → RIFE ×2 on the GPU → 30 fps |
| Presets | `reel_fast` 480×832, 6 steps · `reel_hq` 544×960, 8 steps |

**One expert per GPU.** With ComfyUI-MultiGPU, the high-noise expert stays on GPU 0 and the low-noise expert on GPU 1,
so the two 14B models never swap. Without that node pack both share GPU 0 and ComfyUI swaps them (slower, same
result).

**Keyframes, not prompts, move the camera.** Each clip is a *first-last-frame* render (`WanFirstLastFrameToVideo`):
both keyframes are crops of the jeweller's still, so the clip starts **and ends** on the real piece and can't drift
far in between. The motion text only picks the move: push-in (full frame → 1.15x crop on the piece), sideways dolly,
tilt or crane. A model scene uses a gentle 1.08x push-in and "the model holds still".

**The real product in every frame** (`lock_product`, CPU): the scene still's product mask (uploaded by the image
notebook) gives the real piece; in each frame it is found by feature matching (the planned camera path fills gaps),
and `restore_product` rebuilds it from the still's pixels where the frame agrees. Tested on the old drifting clip:
62 of 79 frames locked in 35 s on 4 CPUs, the original bells and enamel back in place. Older stills without a mask
skip the lock.

Where the piece can't be rebuilt in a frame (hidden, too far off), the rebuild fades out and back in over 4 frames
around it (`LOCK_RAMP`), so the piece never snaps between the photo's pixels and the generated ones.

**Quality gate** (`clip_qa`, every scene take, before encoding): it rejects

- broken frames (black, blown out or blank: fp16 NaNs) and too few frames;
- a sudden jump: one frame change far above the clip's own motion, i.e. a cut or a morph;
- brightness flicker;
- a real piece matched in under 40 % of the frames, meaning it drifted, melted or was covered.

A take with any of these is rendered **once more with a new seed**, if the session has time for it, and the better
take is delivered. Broken frames in both takes fail the clip. The delivered seed and anything the gate still saw go
in the `clipDone` event (logged as "Clip delivered"); the seed re-renders that exact take. The thresholds are in
`QA_*` at the top of the render cell.

**After rendering**: frames upscaled to 1080×1920 (lanczos), product locked, gate passed, then **one** lossy encode
(x264 CRF 16, preset slow, High profile 4.2, AAC 48 kHz, faststart):

- **BT.709 conversion, tagged in the file.** Untagged files are decoded with the wrong matrix on phones and
  Instagram, and gold shifts hue. A flat gold patch survives the round trip within 2 levels.
- Scene clips also get a 5-frame **deflicker**, which smooths brightness steps from the tiled VAE decode, and a
  light luma-only **CAS sharpen** of the 2× upscale (needs ffmpeg ≥ 4.3; skipped on older builds).
- `validate_render` checks size, fps, duration and bitrate, then decodes the whole file: a truncated or corrupt
  clip is never uploaded.

**Robustness**:

- Image downloads retry with backoff, and the clip upload retries 5 times; an expired URL (4xx) fails at once.
- A ComfyUI crash restarts the engine (port 8188 only — the voice engine on 8190 is left alone) and renders the
  clip once more.
- ComfyUI's input keyframes and output PNGs are always removed, even when a take fails.

**Clips are pipelined over both GPUs and the CPU** (`run()` in the run cell):

- **Two ComfyUIs, one Wan expert each.** ComfyUI on port 8188 sees only GPU 0 and runs the high-noise half of the
  steps; ComfyUI on 8189 sees only GPU 1 and runs the low-noise half, the VAE decode and RIFE.
- **Exact hand-over.** Two tiny nodes (`bb_handoff.py`, written at install) pass the conditioning and latent between
  them unchanged; a local round trip was bit-identical. It is the same graph, cut where the experts hand over.
- **Overlap.** GPU 0 starts clip N+1 while GPU 1 finishes clip N. Meanwhile the CPU locks the product into the clip
  before, runs the quality gate and encodes it, on 3 threads (one vCPU is left for the ComfyUIs).
- **Gains.** With 3 clips the sampling is roughly 1.4–1.8× faster than one clip after another. A single clip takes
  the same time as before.
- **Recovery.** Out of GPU memory → the next smaller size; a crashed ComfyUI → restarted once; a failed take → a new
  take, queued ahead of new clips. Every clip ends with exactly one done / failed / deferred event.
- **Session time.** A new clip only starts if it can finish inside the Kaggle session; the rest hand over.
- **Fallback.** If the second ComfyUI can't start (one GPU, under 8 GB of free RAM, or a start error), the session
  uses the old single ComfyUI with ComfyUI-MultiGPU for the rest of its life.
- **CPU work runs side by side.** Loading frames, finding the piece in each frame (SIFT, one detector per thread) and
  rebuilding it: 82 s → 41 s on the 79-frame test clip on an 8-core machine. Expect less on Kaggle's 4 vCPUs.

**Several clips per job.** A warm session that starts a job also takes the campaign's other waiting clips (same
render engine, up to 3 clips in all) — but never the ones another idle or booting session would take, so free
accounts still render in parallel. Each taken job becomes DONE with `payload.mergedInto` and joins the job's batch;
the batch status leaves it out. Image jobs work the same way (see §5).

**C2C Multi-GPU Split is not used for the detailed render:**

- It refuses GGUF loaders (its docs: "use a core loader"), and the A14B experts must be GGUF to fit a T4.
- It would need a full copy of the active expert on each GPU, swapping both 10.8 GB experts on both cards every clip.

The fast render (§6b) uses it.

**Not used: GAN upscalers** (Real-ESRGAN etc.). They work frame by frame and invent texture differently in every
frame, which flickers on video; the product region is rebuilt from the real 1080×1920 still anyway.

The logo clip is animated on the CPU (fade, slow zoom, light sweep over the gold lettering) — no video
model, so the typeset name stays spelled exactly.

**Prompting at CFG 1**: a negative prompt has no effect, so the positive prompt describes only the camera and light,
never hands or people ("no hands" brings hands in). `safeMotion()` still turns any motion that rotates or handles
the piece into a camera move.

**Out-of-memory protection**: tiled VAE decode, 0.8 GB VRAM reserve, and `render_clip_safely()` steps down
544×960 → 480×832 → 448×784 → 416×736. Long jobs hand over before Kaggle's 12-hour limit (first-clip estimate 25 min
fast / 40 min HD, then the measured average).

Timing (estimate, not yet measured on Kaggle): ~13 min per 480p clip was reported for A14B + LightX2V on one T4 at
6 steps; one expert per T4 removes the swapping. Check the "Rendering scene N · step x/y" timestamps on the first run.

### Post-production (every scene clip)

After the product lock and before the encode, on the CPU:
- **Exposure steadying** (`steady_exposure`): Wan sometimes "breathes" (the whole frame brightens and darkens by
  10–20 % over a second). Each frame's brightness is eased onto the clip's straight-line trend with a tone curve.
- **Real glints** (`add_glints`): three short twinkles, each on a different specular highlight of the *locked* piece
  (found in the still: bright and standing out from its surroundings), carried with the piece's per-frame position
  and only on frames where it is locked. A camera-style four-point star, screen-blended and tinted by the highlight's
  own colour. Added glints look real where AI-drawn sparkle looks fake.
- **Grade** (`grade_frames`): a gentle S-curve, equal on R, G and B so gold and silver keep their hue, and a barely
  visible vignette.
- **Grain**: ffmpeg `noise` on the luma plane only, very fine; it breaks up banding in dark backdrops.

**Quality gate additions (piece integrity).** Two more defects make a take worth a retake, both measured on the
locked piece: it **moves on its own** — held more than 2 % of the frame width away from where the camera alone would
put it for 6 frames in a row (the planned camera path in a first-last-frame render; the scene's own measured motion,
ORB + RANSAC around the piece, in a fast render) — or it **vanishes** for 8 frames in a row (covered, lifted away or
melted). Model scenes allow 2.5× both, since a worn piece moves a little with the body. On the 20 labelled
product-only clips in `videos test/` (old start-frame renders: hands pushing, lifting or poking the piece, spins,
melts) these two checks plus the lock rate agree with a human 20/20; they catch hands *through what they do to the
piece*, which the off-the-shelf hand / person detectors (MediaPipe palm, YuNet face, MediaPipe person) did not on
generated close-ups.

**Colour.** The fast engine sometimes drifts the white balance for a second (a brass thali turning silver, green
kundan stones going blue). `steady_colour` pulls each frame's mean a*/b* back towards the still's wherever it strays
by more than 6 units — clean clips stray up to ~5.5 on their own (smoothed over 9 frames, lightness untouched); and in tracked frames the product lock now
restores a colour jump where the piece's fine detail still lines up — that is drift, not a finger in front of it.
What is left is measured: `piece_colour_shift` warps each frame's piece back onto the still's and counts the share
whose colour left it (a*/b* difference over 18), held for 6 frames. Over 12 % fails the take ("the piece's colours
change"); the drifting tikka clip read 38 %, six clean clips 0–1 %.

**When every take lost the piece** (it moved on its own, vanished, or was matched in too few frames — a fast-engine
tilt that left the payals out of frame, a hand that covered them), the clip is not delivered as rendered: it becomes a
**camera move over the approved still** (`still_motion`: an eased push-in to 108 % towards the piece), with the real
product locked in, glints, grade and grain as usual. Its quality note says so. On the test still the piece locks in
81/81 frames and the gate reads it clean.

Small worn pieces (a ring on a hand, ~60 px wide in the frame) have too few features to match frame by frame:
`track_piece` follows them with ECC alignment of the still's own pixels around the piece, seeded by the camera path,
and where it holds, the still's piece is used as is (`restore_product(..., trust=True)`), so its texture cannot melt.
A redrawn still with no restored product gets a mask over the drawn piece (its matched outline, or the judge's
`piece_box`), so even those clips are locked.

## 6a. The voice notebook (voiceovers)

**What it is:** the Marketing page's **Voice studio** tab turns text into speech in the voice of an uploaded sample
(6+ seconds of clear speech), in 23 languages, with **ChatterBox Multilingual** (Resemble AI, MIT) — the same
`FL_ChatterboxMultilingualTTS` node (ComfyUI_Fill-ChatterBox) as the ComfyUI workflow: `LoadAudio` →
`FL Chatterbox Multilingual TTS` → `Save Audio`, with the same settings (exaggeration, cfg_weight, temperature,
repetition_penalty, min_p, top_p, seed).

**Flow:** `POST /api/v1/marketing/voiceovers` (text, language, the sample as base64 or `sampleFromId` to reuse an
earlier voice, optional settings) stores the sample in the marketing bucket (`voiceovers/<user>/<id>/`) and queues a
`VOICE` render job. Like every job it waits for a free warm worker (`pipeline: 'voice'`); progress arrives as
`marketingVoiceoverUpdated` on the user's WebSocket, and the MP3 when it is done. `POST …/:id/regenerate` makes a
new take (new seed unless one is given), `DELETE …/:id` removes it.

**The notebook** (`voice-worker.notebook.ts`, a separate notebook):

1. Starts its own ComfyUI on **port 8190** with ComfyUI_Fill-ChatterBox, on whichever T4 has ~5 GB free — normally
   GPU 1 beside the image analyst — so a warm session never drops klein / Qwen3-VL / Wan for a voiceover. It stays
   up (model loaded) between voice jobs; the session stops it before image or video work needs the memory.
2. Converts the sample to a mono WAV (at most 60 s), splits the text into sentence groups of ≤ 280 characters (the
   model drifts on long inputs), and runs one ComfyUI prompt with one TTS node per part (`keep_model_loaded`).
3. Joins the parts with 0.3 s pauses, loudness-normalises them (−16 LUFS) and uploads a 192 kbps MP3.

**Models:** the six ChatterBox files (`ResembleAI/chatterbox`: `ve.pt`, `t3_mtl23ls_v2.safetensors`, `s3gen.pt`,
`grapheme_mtl_merged_expanded_v1.json`, `conds.pt`, `Cangjie5_TC.json`) are part of every account's model cache
(`VOICE_MODEL_FILES`, staged in the session's `voice` group) at `ComfyUI/models/chatterbox/chatterbox_multilingual/`,
where the node looks — nothing downloads at run time on a cached account.

**Ad scripts from inventory ("Write an ad"):** `POST /api/v1/marketing/voiceovers/script` with an
`inventoryItemId` and a `style` — `en`, `hi` (Hindi) or `hinglish` (Hindi with everyday English words, written in
Devanagari: "पेश है एक ख़ूबसूरत गोल्ड रिंग, जिसका वेट है सिर्फ़ एक ग्राम।") — returns a short ad (10–15 s) and the voice
language to speak it in (`en` / `hi`). `buildAdScript()` (`voiceovers/utils/ad-script.ts`) fills hand-written
phrase banks at random (hook, product line, purity, hallmark, a benefit, call to action), so every call reads
differently, but it only ever states the item's real facts: the piece (from its name / category), metal, purity
(22K / 916 → "बाईस कैरेट", 925 → sterling silver), net (else gross) weight, BIS hallmark (an HUID is set) and the shop
name. Hindi gender and plural agreement is handled (सोने **की** अंगूठी, सोने **के** झुमके, **पेश हैं**), and numbers are
written as words for the Hindi voice ("डेढ़ ग्राम", "साढ़े चार ग्राम", "दो पॉइंट तीन ग्राम"). Prices are never mentioned
(rates change).

**Written by a text model, checked by code.** The script is first written by **Gemma 4 26B** on Workers AI
(fallback Llama 3.3 70B; `MARKETING_SCRIPT_MODEL`, through the Cloudflare account pool with its rotation and quota cooldowns): the prompt lists
the facts in the exact words to say (numbers already as Hindi words) plus a random angle and tone, so every version is
new. `checkAdScript()` then rejects any reply that breaks a rule — Latin letters or digits in Hindi / Hinglish, the weight,
karat or shop name missing or changed, a karat / hallmark / stone the item doesn't have, any price, offer, discount or
delivery word, a stutter ("आकर आकर"), or the wrong length. One retry, then the template writer — the button always works;
the response says `source: 'ai' | 'template'`. Live check (Nov 2026, synthetic 1 g 22K ring): 9/9 replies passed.

**Which Cloudflare models, and why (Nov 2026, free plan).** Benchmarked on our own prompts: Gemma 4 26B wrote 10/10
valid Hindi / Hinglish / English ad scripts (~2 s) and described the kada photo most accurately (several bangles,
engraved pattern, charms, beads, enamel — no invented stones) for ~5 neurons a call; Llama 3.3 70B also wrote 5/5 but
costs ~7x more per output token; Qwen 3.8 27B made spelling mistakes in Hindi and miscounted the bangles; Llama 4 Scout
wrote "BIS" in Latin letters; Mistral Small invented stones. GLM-5.3, Kimi K2.6 and DeepSeek V4 need Workers Paid.
Reasoning models (Gemma 4, Qwen 3) are called with thinking off (`chat_template_kwargs.enable_thinking = false`), or
they spend the whole token budget thinking. **Image to text:** the item's photo is described once per photo (cached)
and the notes ("intricate floral engravings, small hanging beads") go into the script prompt, so the ad describes that
very piece; words about stones are dropped unless the item is a diamond piece.

**Narration speed.** `settings.speed` (0.7–1.4, default 1) is applied by the voice notebook after ChatterBox speaks
(ffmpeg `atempo` — the pitch, i.e. the voice, stays the same; pauses scale with it). In the Voice studio the slider sets
it for new voiceovers; on a finished one the speed chips change playback at once (browser `playbackRate`, pitch kept)
and **Apply** saves it as a new take with the same seed and settings, so only the speed changes.

**Shop name pronunciation.** For Hindi and Hinglish the shop name is spoken from its Devanagari spelling: the model
transliterates it once ("Shree Ganesh Jewellers" → "श्री गणेश ज्वेलर्स") and it is stored on the brand
(`marketing_brands.spoken_name`, migration `1700000000012`; redone if the business name changes). The owner can correct it
in the Voice studio (`PUT /api/v1/marketing/voiceovers/shop-name`); their spelling is never replaced.

Database: `marketing_voiceovers` (migration `1700000000011`).

## 6b. The fast video notebook (fast render)

When a campaign is created, the user chooses **Video render: Slow & detailed** (default, §6) or **Fast video**.

- **Where it's stored.** `marketing_campaigns.video_engine` = `detailed` | `fast` (migration 13). Each clip job
  copies it into `payload.videoEngine`.
- **Which notebook.** `fast` jobs get `buildFastReelNotebook` (`fast-reel-worker.notebook.ts`) and the warm-session
  pipeline `video-fast`. Switching between `video` and `video-fast` frees the GPUs, like image ↔ video.

| Part | Setting |
| --- | --- |
| Model | **Wan 2.2 TI2V-5B** fp16 (Apache-2.0) + Wan 2.2 VAE + the same umT5-XXL |
| Both GPUs | **C2C Multi-GPU Split** (Code2Collapse node pack): a full model copy per T4; CFG's two halves (and the tokens) of every step run side by side |
| Sampler | uni_pc / simple, 20 steps (Standard) or 30 (HD), CFG 4.5, shift 6 — the settings it ran with in production before A14B |
| Frames | 121 at 24 fps (5 s), **kept at 24 fps** (no interpolated or repeated frames) |
| Sizes | Standard 480×832 · HD 704×1280, OOM ladder 704→608→544→480 wide |

**What stays the same:**

- The scene still is the start frame.
- The real product is locked into every frame on the CPU, without a camera plan: every SIFT match is trusted, and
  gaps borrow a neighbour only 1–2 frames away. Test: 89/121 frames locked.
- Same quality gate (one new take), BT.709 encode, validation, upload, pipelining with the CPU, retries and
  hand-over.

**What's looser:** TI2V-5B has no end frame, so the camera moves by prompt only. Its motion and fine detail are less
faithful than A14B's; the product lock rebuilds the real piece where it can.

**When C2C fails** (it refuses the hardware, or a node error), the session goes on with one GPU (`WORKER["c2c_off"]`)
and the clip renders again. Its speed-up on T4s is still unmeasured. On paper it's up to ~2×, because the CFG halves
need no data exchange. Check the "step x/y" timestamps on the first fast runs.

**Model cache:** TI2V-5B (10 GB) and its VAE (1.4 GB) joined the per-account dataset, so its slug changed and every
account rebuilds its cache once.

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
3. **Ask for work.** It calls `POST /api/v1/public/marketing/worker/next` (also its heartbeat). When there is nothing
   to do it **waits on the WebSocket** for up to 10 s instead of sleeping: the session registers its socket
   (`sessionListening`), and every dispatch first pushes `marketingWake` to idle sessions (`wakeIdleSessions`), so a
   new job is picked up within about a second. The answer's `listening: false` tells it to register again; without a
   socket it simply polls.
   **Pipeline-aware claiming:** `claimNextForSession` prefers jobs for the models the session already has loaded
   (image sessions take image jobs first, video sessions clip jobs), so a session doesn't drop klein + Qwen3-VL to
   load Wan (or the reverse) while matching work is waiting.
   **Progress never blocks the GPUs:** both notebooks' reporters send from a background thread (in order); a final
   event waits until everything before it was delivered.
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
**account setup** notebook saves all models (~68 GB: klein 9B, Qwen3-VL, BiRefNet_HR, the two Wan A14B experts and
their LoRAs) as a **private Kaggle dataset** on each account. Warm
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

## 8a. Colab Enterprise accounts

A GPU account can also be a **Google Cloud project** running the same notebooks on **Colab Enterprise** (Vertex AI
notebook execution jobs). Everything else is shared: the same queue, warm workers, notebooks, status screens and
admin page. Only the provider client differs (`ColabEnterpriseClient` next to `KaggleApiClient`, behind
`KaggleWorkerPool`, which routes each call by the account's `provider`).

| | Kaggle | Colab Enterprise |
| --- | --- | --- |
| Credential | username + API key / `KGAT_` token | account name + service-account key JSON |
| GPUs | T4 × 2 (free weekly quota) | 2 × T4 (`n1-standard-8`) or 2 × L4 (`g2-standard-24`), billed per hour |
| Start a run | `kernels/push` | `POST …/notebookExecutionJobs` (notebook inline, base64), display name `<account>--<kernel>` |
| Run status | `GetKernelSessionStatus` | newest job with that display name (`jobState`) |
| Kernel ref | `user/slug` | `colab/<project>/<account>/<kernel>` (the admin link opens the project's executions) |
| Model cache | private dataset, mounted under `/kaggle/input` | `gs://<bucket>/byajbazaar-models/<slug>`, copied to the disk at boot |
| Session cap | Kaggle's 12 h | the account's **Max hours per session** (default 6), also the job's `executionTimeout` |

**Cost rules.** Colab accounts are billed while they run, so:
- dispatch gives work to a **free Kaggle account first**; a Colab account only takes jobs no Kaggle account can;
- a Colab warm session is **never the keeper**: idle, it stops after 5 minutes (Kaggle's keeper waits
  `warmIdleMinutes`);
- every run has a hard `executionTimeout` (the account's max hours) in case a VM hangs.

**Setting one up (Google Cloud).**
1. Pick a region with T4/L4 GPUs for Colab Enterprise (e.g. `asia-south1`, `us-central1`) and make sure the project
   has GPU quota there (2 per session × parallel renders).
2. Enable the **Vertex AI API**. Create a **bucket** in the same region (outputs + model cache; same region = fast,
   no egress).
3. Create a service account with **Vertex AI User** and **Service Account User** on the project and **Storage Object
   Admin** on the bucket; download a JSON key.
4. `/admin/kaggle` → **Add accounts** → **Colab Enterprise**: name, key JSON (paste or load the file), region,
   bucket, GPUs, parallel renders, max hours. **Verify & save** checks the key, the Vertex AI permission and the bucket.
5. The setup run checks the GPUs and disk, then downloads every model once and uploads it to the bucket (manifest
   last). Sessions after that copy the models from the bucket in a few minutes.

**Notebook differences.** The notebooks detect Colab themselves: the heavy `/tmp` folders (ComfyUI, model staging)
are pointed at the VM's largest disk when `/tmp` is small (`big_disk()`), outputs go to `/tmp` instead of
`/kaggle/working`, and the model cache comes from Cloud Storage (`gcs_download`, chunked and parallel for big files)
instead of the dataset mount. Keys are stored as plain text like Kaggle keys and never returned by the API (the
admin card shows the service account's email).

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

### …add a Colab Enterprise account

See [8a](#8a-colab-enterprise-accounts): enable Vertex AI, create a bucket in the GPU region and a service account
(Vertex AI User, Service Account User, Storage Object Admin on the bucket), then `/admin/kaggle` → **Add accounts** →
**Colab Enterprise**. Set a budget alert on the project: it is billed per GPU-hour.

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
6. Pipelining and fast render (this release):
   - Migration `1700000000013` adds `video_engine`.
   - The model cache slug changed (TI2V-5B added), so every account rebuilds its cache once.
   - On the first campaign with 3+ scenes, the session log should show "Pipelining waiting siblings" and the video
     engine "one Wan expert per GPU, clips overlap".
   - On the first **Fast video** campaign, check whether C2C ran or fell back ("rendering on one GPU") and note the
     step timing.

7. Colab Enterprise and post-production (this release):
   - Migration `1700000000014` adds `provider` / `colab_config` to `kaggle_credentials` and widens `models_dataset`.
   - Existing Kaggle accounts are unchanged (`provider` defaults to `kaggle`).
   - Add a Colab account (8a) and watch its setup run; the card shows "Colab Enterprise · project · region".
   - Scene clips now get glints, a light grade and fine grain (6, *Post-production*); compare one new clip with an
     older one.

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
| `Scene N failed the quality check: …` | Both takes had broken (black / blank) frames — usually fp16 overflow on that still. Rerun the scene; if it repeats, regenerate the scene image. |
| "Quality check on scene N: … — rendering a new take" | Normal: the first take had a jump, flicker or a drifting piece; the clip takes about twice as long. |
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
| **Take / try** | One attempt at painting a shot (2, a third after two clear failures); the judge keeps the best. |
| **ComfyUI** | The open-source engine that runs klein and Wan graphs inside the notebook. |
| **klein** | FLUX.2 [klein] 9B, the image model (needs `MARKETING_HF_TOKEN`). |
| **Batch** | Jobs queued together (one per scene, shot or clip) that run in parallel and show as one status. |
| **Model cache** | The private Kaggle dataset with every model, built once per account. |
| **Exact / AI mode** | The user's image choice: keep the real product pixels, or redraw everything. |
