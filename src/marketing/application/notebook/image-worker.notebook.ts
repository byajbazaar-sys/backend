export interface ImageNotebookTarget {
  index: number;
  kind: string;
  prompt: string;
  motionPrompt?: string;
  uploadUrl: string;
  width: number;
  height: number;
}

export interface ImageNotebookJob {
  jobId: string;
  token: string;
  wsUrl: string;
  apiBaseUrl?: string;
  sourceImageUrl?: string;
  type: 'campaign' | 'photoshoot' | 'logo';
  title: string;
  style?: string;
  targets: ImageNotebookTarget[];
}

const md = (source: string) => ({ cell_type: 'markdown', metadata: {}, source });
const code = (source: string) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source });

const CELL_SETUP = `
import os, sys, json, time, subprocess, traceback, threading, io, re, gc, requests, websocket
subprocess.run([sys.executable, "-m", "pip", "install", "-q",
                "transformers>=4.57,<5", "diffusers>=0.32", "accelerate>=1.2",
                "bitsandbytes>=0.45", "qwen-vl-utils>=0.0.10", "safetensors", "pillow"], check=True)
import torch
from PIL import Image, ImageFilter, ImageOps
from transformers import AutoProcessor, BitsAndBytesConfig, Qwen3VLForConditionalGeneration
from diffusers import StableDiffusionXLImg2ImgPipeline, StableDiffusionXLPipeline

JOB = json.loads(__JOB_JSON__)
OUT_DIR = "/kaggle/working/marketing-images"
os.makedirs(OUT_DIR, exist_ok=True)
if not torch.cuda.is_available():
    raise RuntimeError("A Kaggle GPU is required for Qwen3-VL and SDXL.")

class Reporter:
    def __init__(self):
        self.ws = None
        self.lock = threading.Lock()

    def send(self, stage, progress, message="", status=None, force=False, **extra):
        payload = {"action": "marketingProgress", "jobId": JOB["jobId"], "token": JOB["token"],
                   "stage": stage, "progress": int(max(0, min(100, progress))),
                   "message": str(message)[:240]}
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
                except Exception as exc:
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
            except Exception:
                traceback.print_exc()

report = Reporter()
source = None
source_path = None
if JOB.get("sourceImageUrl"):
    report.send("imageSetup", 2, "Downloading source image", force=True)
    response = requests.get(JOB["sourceImageUrl"], timeout=180)
    response.raise_for_status()
    opened = ImageOps.exif_transpose(Image.open(io.BytesIO(response.content)))
    if "A" in opened.getbands():
        background = Image.new("RGB", opened.size, "white")
        background.paste(opened.convert("RGBA"), mask=opened.getchannel("A"))
        source = background
    else:
        source = opened.convert("RGB")
    source_path = os.path.join(OUT_DIR, "source.jpg")
    source.save(source_path, quality=95)
`;

const CELL_ANALYZE = `
try:
    if JOB["type"] == "logo":
        by_index = {
            int(t["index"]): {
                "image_prompt": t["prompt"],
                "motion_prompt": t.get("motionPrompt", "Keep the logo lettering sharp and unchanged.")
            } for t in JOB["targets"]}
    else:
        report.send("imageAnalysis", 8, "Loading Qwen3-VL-4B image analyst", force=True)
        quantization = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16)
        analyst = Qwen3VLForConditionalGeneration.from_pretrained(
            "Qwen/Qwen3-VL-4B-Instruct", torch_dtype=torch.float16,
            quantization_config=quantization, device_map="auto", low_cpu_mem_usage=True)
        processor = AutoProcessor.from_pretrained("Qwen/Qwen3-VL-4B-Instruct")
        from qwen_vl_utils import process_vision_info

        target_brief = [
            {"index": t["index"], "kind": t["kind"], "direction": t["prompt"],
             "motion": t.get("motionPrompt", "")} for t in JOB["targets"]]
        request_text = (
            "Inspect the supplied jewellery product photo carefully. Identify only visible facts: jewellery type, "
            "metal colour, shape, stones, arrangement, distinctive motifs, and approximate proportions. Do not invent "
            "details. Then create one distinct premium commercial photo prompt for each requested shot. Keep the exact "
            "jewellery identity, stone count and placement, metal colour, and proportions from the reference; do not add "
            "or remove product details. Use the requested visual direction and campaign style. The product must be the "
            "hero, sharp, fully visible, photorealistic, with realistic lighting and natural anatomy for any adult model. "
            "No text, watermark, extra jewellery, or duplicate product. For each shot return a short, controlled camera "
            "motion prompt suitable for a 5-second image-to-video generation. Output only valid JSON with this shape: "
            '{"product_facts":"...", "shots":[{"index":0,"image_prompt":"...","motion_prompt":"..."}]}. '
            "Include every supplied index exactly once. Avoid claims that are not visible in the reference.\\n"
            f"Campaign title: {JOB['title']}\\nVisual style: {JOB.get('style', 'premium jewellery advertising')}\\n"
            f"Requested shots: {json.dumps(target_brief, ensure_ascii=False)}")
        messages = [{"role": "user", "content": [
            {"type": "image", "image": source_path}, {"type": "text", "text": request_text}]}]
        prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        image_inputs, video_inputs = process_vision_info(messages)
        inputs = processor(text=[prompt], images=image_inputs, videos=video_inputs,
                           padding=True, return_tensors="pt").to(analyst.device)
        generated = analyst.generate(**inputs, max_new_tokens=1400, do_sample=False)
        generated = generated[:, inputs.input_ids.shape[1]:]
        answer = processor.batch_decode(generated, skip_special_tokens=True)[0].strip()
        match = re.search(r"\\{.*\\}", answer, re.S)
        result = json.loads(match.group(0) if match else answer)
        by_index = {int(x["index"]): x for x in result["shots"]}
        expected = {int(x["index"]) for x in JOB["targets"]}
        if set(by_index) != expected:
            raise ValueError(f"Qwen returned shot indices {sorted(by_index)}, expected {sorted(expected)}")
        for idx, shot in by_index.items():
            if not isinstance(shot.get("image_prompt"), str) or len(shot["image_prompt"].strip()) < 30:
                raise ValueError(f"Qwen returned an invalid image prompt for shot {idx}")
            if not isinstance(shot.get("motion_prompt"), str) or len(shot["motion_prompt"].strip()) < 8:
                raise ValueError(f"Qwen returned an invalid motion prompt for shot {idx}")
        print("Qwen product analysis:", result.get("product_facts", ""), flush=True)
        del analyst, processor, inputs, generated
        gc.collect()
        torch.cuda.empty_cache()
except Exception as exc:
    traceback.print_exc()
    report.send("failed", 10, f"Qwen image analysis failed: {type(exc).__name__}: {exc}",
                status="failed", force=True)
    raise
`;

const CELL_GENERATE = `
try:
    report.send("imageGeneration", 20, "Loading SDXL image generator", force=True)
    pipeline_type = StableDiffusionXLPipeline if JOB["type"] == "logo" else StableDiffusionXLImg2ImgPipeline
    generator = pipeline_type.from_pretrained(
        "segmind/SSD-1B", torch_dtype=torch.float16,
        variant="fp16", use_safetensors=True)
    generator.enable_model_cpu_offload()
    generator.enable_vae_slicing()
    generator.enable_vae_tiling()
    generator.set_progress_bar_config(disable=True)

    def source_canvas(width, height):
        background = ImageOps.fit(source, (width, height), method=Image.Resampling.LANCZOS)
        background = background.filter(ImageFilter.GaussianBlur(35))
        foreground = ImageOps.contain(source, (width, height), method=Image.Resampling.LANCZOS)
        background.paste(foreground, ((width - foreground.width) // 2,
                                      (height - foreground.height) // 2))
        return background

    def negative_prompt():
        if JOB["type"] == "logo":
            return ("illegible lettering, misspelled words, gibberish text, extra text, watermark, blurry, "
                    "low resolution, cluttered composition, mockup, people, cartoon")
        return ("different jewellery design, changed silhouette, wrong metal colour, added or missing stones, "
                "extra jewellery, duplicate product, deformed hands, extra fingers, malformed face, text, logo, "
                "watermark, low resolution, blurry, oversaturated, cartoon, illustration")

    def report_diffusion_progress(pipe, step, timestep, callback_kwargs):
        if step % 5 == 0:
            pct = 22 + int(68 * (position + step / 40) / max(1, len(JOB["targets"])))
            report.send("imageGeneration", pct, f"Generating image {position + 1}/{len(JOB['targets'])} · step {step + 1}/40",
                        force=True, imageIndex=idx)
        return callback_kwargs

    failures = []
    for position, target in enumerate(JOB["targets"]):
        idx = int(target["index"])
        try:
            analysis = by_index[idx]
            width, height = int(target["width"]), int(target["height"])
            init_image = source_canvas(width, height) if source is not None else None
            if JOB["type"] == "logo":
                final_prompt = (
                    f"{analysis['image_prompt'].strip()} "
                    "Centered, clean brand identity on a simple high-contrast background, precise spacing, "
                    "crisp refined lettering, no extra words.")
            else:
                final_prompt = (
                    f"{analysis['image_prompt'].strip()} "
                    "Premium photorealistic jewellery advertising photography, authentic materials, precise craftsmanship, "
                    "natural proportions, clear product silhouette, crisp focus on the jewellery, refined composition.")
            report.send("imageGeneration", 22 + int(68 * position / max(1, len(JOB["targets"]))),
                        f"Generating image {position + 1}/{len(JOB['targets'])}",
                        force=True, imageIndex=idx)
            generation_options = {
                "prompt": final_prompt,
                "negative_prompt": negative_prompt(),
                "guidance_scale": 7.0,
                "num_inference_steps": 40,
                "width": width,
                "height": height,
                "generator": torch.Generator(device="cpu").manual_seed(int(time.time_ns() % (2**32))),
                "callback_on_step_end": report_diffusion_progress,
            }
            if init_image is not None:
                generation_options.update({"image": init_image, "strength": 0.58})
            result_image = generator(**generation_options).images[0]
            output = os.path.join(OUT_DIR, f"image-{idx}.jpg")
            result_image.save(output, "JPEG", quality=95, optimize=True)
            with open(output, "rb") as image_file:
                requests.put(target["uploadUrl"], data=image_file,
                             headers={"Content-Type": "image/jpeg"}, timeout=300).raise_for_status()
            report.send("imageDone", 22 + int(68 * (position + 1) / max(1, len(JOB["targets"]))),
                        f"Image {idx} ready", force=True, imageIndex=idx,
                        imagePrompt=analysis["image_prompt"][:4000],
                        motionPrompt=analysis["motion_prompt"][:2000])
            del result_image, init_image
            gc.collect()
            torch.cuda.empty_cache()
        except Exception as exc:
            traceback.print_exc()
            failures.append(idx)
            report.send("imageFailed", 22 + int(68 * (position + 1) / max(1, len(JOB["targets"]))),
                        f"Image {idx} failed: {type(exc).__name__}: {exc}", force=True,
                        imageIndex=idx)

    if len(failures) == len(JOB["targets"]):
        raise RuntimeError("Every image failed: " + ", ".join(map(str, failures)))
    report.send("completed", 100, f"Done ({len(JOB['targets']) - len(failures)}/{len(JOB['targets'])} images)",
                status="completed", force=True, failedImages=failures)
except Exception as exc:
    traceback.print_exc()
    report.send("failed", 0, f"{type(exc).__name__}: {exc}", status="failed", force=True)
    raise
`;

export function buildImageWorkerNotebook(job: ImageNotebookJob): Record<string, unknown> {
  const jobJson = JSON.stringify(JSON.stringify(job));
  const cells = [code(CELL_SETUP.replace('__JOB_JSON__', jobJson)), code(CELL_ANALYZE), code(CELL_GENERATE)];
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
          `Auto-generated for job \`${job.jobId}\`. Qwen3-VL analyzes the source photo and SDXL creates the requested images.`,
      ),
      ...cells,
    ],
  };
}
