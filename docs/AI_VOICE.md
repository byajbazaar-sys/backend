# ByajBazaar AI — voice

People talk to the assistant in Hindi, English, Hinglish, Gujarati or Marathi and hear English and Hindi replies
(Hindi on ByajBazaar's warm Kaggle GPU workers, §2a). Voice is a
second way into the **same** assistant: a spoken message becomes a transcript, the transcript goes through the
existing orchestrator, tools, previews and confirmation rules, and it lands in the same conversation as typed
messages. Everything runs on Cloudflare-hosted models; no other speech provider is used.

Code: `cloudflare/voice-gateway` (Cloudflare Worker + Durable Object), `Backend/src/ai/voice` (sessions and turns),
`fe-byajbazaar/hooks/useVoiceAssistant.ts` + `lib/voice` + `components/ai/VoiceControls.tsx` (web),
`mobile-byajbazaar/src/hooks/useVoiceAssistant.ts` + `src/voice` (mobile).

## 1. How it fits together

```
app mic ──binary WebSocket (bb.voice.v1)──► voice gateway (Worker + Durable Object per session)
                                              ├─ speech-to-text: Workers AI Whisper large-v3-turbo
                                              ├─ transcript ─► ByajBazaar API POST /api/v1/ai/voice/gateway/turns
                                              │                 └─ AiOrchestratorService.chat (same as typing)
                                              └─ text-to-speech: Workers AI Aura-2 (English) ─► MP3 frames ─► app
```

1. The app asks the API for a session: `POST /api/v1/ai/voice/sessions` (normal sign-in, shop and paywall checks).
   It gets the gateway URL and a **ticket** signed by the API (HMAC), valid 2 minutes for connecting; the session
   itself lasts at most 15 minutes. Reconnecting asks for a fresh ticket (`POST …/sessions/:id/ticket`).
2. The app opens `wss://voice.byajbazaar.com/v1/connect?ticket=…`. The Worker checks the ticket and hands the
   socket to the session's Durable Object. Cloudflare tokens never reach the app.
3. Each utterance is streamed as 16 kHz PCM (web: AudioWorklet; mobile: expo-audio's audio stream). On the web the
   conversation is **full duplex** (§3a): one tap turns voice on, the microphone stays open, and every time the
   person talks an utterance opens — also while the assistant is thinking or speaking. It ends after 1 s of quiet,
   30 s, or 2 MB. Mobile is still tap-to-talk (ends after 1.2 s of silence or a tap).
4. The gateway transcribes it and sends the text to the API with its key and the ticket. The API reads the
   person's shop access **again** (a removed or demoted member loses voice at the next turn), cleans up the
   transcript, and runs the turn through the orchestrator — same tools, same previews, same rules.
5. The reply comes back as text, cards and previews (shown exactly like a typed answer). If it is English and
   "Read replies aloud" is on, the gateway speaks it sentence by sentence; the first sentence plays while the next
   is made.

## 2. Models (verified)

Checked against Cloudflare's catalogue and the Workers AI typings in `@cloudflare/workers-types` (Nov 2026). The model
IDs live in one place: `cloudflare/voice-gateway/src/models.ts` (overridable by wrangler vars).

| Job | Model | Why | Price |
| --- | --- | --- | --- |
| Speech-to-text | `@cf/openai/whisper-large-v3-turbo` | Hindi, English, Gujarati, Marathi (and Hinglish as Hindi); reports the language and per-segment confidence; takes a vocabulary prompt | $0.000513 / audio minute |
| Text-to-speech, English | `@cf/deepgram/aura-2-en` | the only usable Cloudflare-hosted voice: English | ≈ $0.03 / 1,000 characters (third-party figure — check the Cloudflare pricing page) |
| Text-to-speech, Hindi | ChatterBox Multilingual (Resemble AI, MIT) on the warm Kaggle workers — the Voice studio's engine | Hindi (and Marathi read in the Hindi voice); §2a | free Kaggle GPU hours |
| Assistant | unchanged (`AI_LLM_MODEL`, Gemma 4 on Workers AI) | voice never calls a model of its own | as today |

Not used, and why: `@cf/deepgram/nova-3` (real streaming, but only 10 languages on Workers AI — no Gujarati or
Marathi — and about 18× Whisper's price); `@cf/deepgram/flux` (English only); `@cf/myshell-ai/melotts` (no Hindi,
retired 20 Nov 2026); `inworld/*` and `openai/tts-*` (Cloudflare proxies them to other companies — they do speak
Hindi, but they are not Cloudflare-hosted). `@cf/pipecat-ai/smart-turn-v2` (end-of-turn detection) is available and
not used yet; turns end on silence.

## 2a. Hindi speech on the warm Kaggle workers (ChatterBox)

Cloudflare hosts no Hindi voice, so Hindi replies are spoken by **ChatterBox Multilingual on ByajBazaar's warm Kaggle
workers** — the same engine, models and accounts as the Voice studio (`docs/MARKETING_KAGGLE_PIPELINE.md` §6a, §7).

```
API (speech plan: Devanagari → chatterbox) ─► gateway session ─► TtsHub Durable Object ◄─WebSocket─ Kaggle worker
                                                    ▲                    │ speak / cancel / demand      (voice lane thread:
                                                    └── MP3 per sentence ◄┘ audio + binary, done         ChatterBox on :8190)
```

- **Which replies:** Devanagari text (Hindi; Marathi is read in the Hindi voice — ChatterBox has no Marathi) goes to
  Kaggle, written for the voice first (numbers, rupees, grams, percent and karat as Hindi words: "₹1,50,000" → "एक लाख
  पचास हज़ार रुपये"). English goes to Cloudflare (fastest). Gujarati (no ChatterBox support) and Hinglish in Latin
  letters stay text. Whisper writes spoken Hindi in Devanagari (the transcript cleaner keeps the script), so with
  "Reply in: Same as my message" people who speak Hindi get Devanagari replies — and hear them.
- **Fast path, not the job queue.** Every warm worker started by dispatch gets the gateway URL and a signed token
  (`utils/assistant-voice.ts`, claims `kind: tts-worker`) and runs a **voice lane** thread: a WebSocket to the gateway's
  `TtsHub` (`/v1/tts-workers`). A reply is sent straight to an idle worker whose voice engine is up, split into
  sentence parts (the first one short), queued at the **front** of the voice engine (ahead of any marketing
  voiceover), and each part's MP3 is streamed back the moment ChatterBox finishes it — in order. The model stays loaded
  between replies.
- **The assistant comes first.** When a voice session starts the gateway sends `demand`: workers bring the voice engine
  up (with the voice job's own set-up code) and report `aiVoiceHot` at every poll. While hot, a worker takes **voice
  jobs only** and is never stopped for being idle; dispatch counts it as free for voice work only, so marketing image /
  video work gets a worker of its own instead of taking the assistant's GPU. Hot lasts 10 minutes after the last use.
- **A worker for the assistant.** Starting a voice session whose replies can be Hindi (reply language Hindi, or
  "same as my message" when the person may speak Hindi / Marathi — `mayReplyInHindi`) checks the database
  (`assistantVoiceStatus`, no Kaggle calls): a worker that can speak for the assistant is up (idle, or "hot"; one busy
  with image / video work does not count) or booting → nothing to do; none → `voice.prewarm` is queued and starts one
  on a free account with the **existing rules** (free slot, GPU hours left, not resting —
  `MarketingRenderService.warmForAssistant`, which first closes workers that stopped polling). English and Hinglish
  replies never start a GPU. The session's answer carries `hindiVoice` (`warm` / `starting` since when /
  `unavailable`, plus the usual warm-up time, `AI_VOICE_HINDI_WARMUP_SECONDS`, default 240) and the app shows the
  warm-up (§3a). Until the worker's voice engine is up, Hindi replies are shown as text.
  *Fixed Nov 2026:* the queue delivery (`AiQueueController` → `toJob`) had no `voice.prewarm` case, so the job ran
  `undefined`, failed, and no worker was ever started for the assistant.
- **Boot watch:** every warm worker is checked with Kaggle 3 minutes after its push and every 3 minutes until it
  reports ready (`watchBoot`, rules in `kaggle-rules.ts` → `bootCheck`). Kaggle kept it queued 8 min (no GPU for the
  account), the notebook stopped (error / ended), or Kaggle runs it but it never reached the API in 10 min (no
  internet on the account) → it is closed with that reason, the account rests 15 min (admin → Kaggle shows the
  reason as its last error) and one started for the assistant is started again on another account (3 tries, within
  30 min of the first ask; the app's warm-up keeps counting from the first ask). Before this, nothing looked at a
  booting worker until the next dispatch, and it held "starting" for 25 min. Admin → Kaggle health shows a booting
  worker's Kaggle state (`kaggleState`, `kaggleMessage`) and whether it reached the API (`reportedAt`).
- **Fallback (Kaggle not free):** no worker connected, none idle with its engine up, or no first audio within 9 s →
  the reply is spoken by Cloudflare when it is in Latin letters, otherwise shown as text (Cloudflare's voice cannot
  read Hindi script). Interrupting cancels the request on the worker (dropped from the engine's queue, or stopped).

| Setting | Where | Default |
| --- | --- | --- |
| `AI_VOICE_KAGGLE_TTS=false` | API (`ai-config`) | on — Cloudflare only when off |
| Hub timings (first audio 9 s, whole reply 60 s, demand 10 min) | `cloudflare/voice-gateway/src/tts-hub-core.ts` | |
| ChatterBox settings (the Voice studio defaults, fixed seed, default voice) | `worker-session.notebook.ts` → `CELL_AI_VOICE` | |

## 3. Known limitations (accepted)

- **Spoken replies are English (Cloudflare) and Hindi (Kaggle).** Gujarati and Latin-script Hinglish replies are
  shown as text with a one-line hint. Hindi is spoken only while a warm Kaggle worker is up (see §2a).
- **Speed of Hindi speech** depends on the T4: ChatterBox is not streamed token by token; the first (short) sentence
  plays when it is done, the next ones follow as they finish. Expect a few seconds before the first Hindi audio.
- **Hindi speech text leaves Cloudflare:** the reply text (it can contain customer names and amounts) is sent to the
  shop's Kaggle notebook to be spoken — the same Kaggle accounts the marketing pipeline already uses.
- **Default voice:** the lane uses ChatterBox's built-in voice (no reference sample). It assumes the
  `FL_ChatterboxMultilingualTTS` node's `audio_prompt` input is optional; if it is required, the lane reports an error
  and the gateway falls back (check on staging).
- **Not true streaming.** Whisper and Aura-2 answer one request at a time. Live transcripts while speaking are made
  by re-transcribing the audio so far every ~1.5 s (≤ 12 times per utterance; costs extra speech-to-text minutes,
  reported separately as `partial_audio_ms`; `PARTIAL_TRANSCRIPTS=off` turns it off). Replies are not
  token-streamed (the API answers in one piece); speech starts after the first sentence is synthesised.
- **Gujarati and Marathi quality is unmeasured.** Whisper lists them; how well it transcribes shop talk in them has
  to be checked with real recordings (see §8). Hinglish usually comes back in Devanagari (Whisper treats it as
  Hindi); the assistant reads both.
- **Interrupting** stops speech at once, but an answer already being worked out still finishes and is saved to the
  conversation (shown as text, not spoken over the newer words — §3a).
- **Echo on speakers without echo cancellation:** the web app measures how much of the assistant's own voice reaches
  the microphone and only lets the person interrupt when they are clearly louder than that (§3a). On such devices a
  soft-spoken person may have to tap Stop; headphones avoid it. Mobile has no barge-in by voice (tap to talk).
- **Answer speed** is set by the assistant, not by voice: in the Nov 2026 end-to-end checks, speech-to-text took
  1.6–3.4 s after the person stopped, the assistant 9–23 s (Gemma 4 with tool calls; ~6k input tokens per call,
  ~25 output), first audio 2.5–6 s. Each model call may take up to `AI_LLM_TIMEOUT_MS` (now 20 s; at 15 s about two
  in three Hindi questions failed with "took too long"), the whole turn `AI_TURN_BUDGET_MS` (24 s) — API Gateway cuts
  every request at 30 s. When no time is left for the second call the answer is the cards found ("Here is what I
  found."), not an error. The apps show what is happening meanwhile (§3a).
- **Confirming by voice** (saying "confirm") works for stock and customer previews only; loans, payments and
  deposits always need a tap on Confirm. A bare "haan" / "yes" never confirms anything.
- **Traditional units** (aana, ratti, bhar, masha) are kept as said and the assistant asks for grams or purity —
  never converts them. Tola (fixed at 11.664 g) is converted and the grams are stated.
- **Mobile** needs a new native build for the updated microphone permission text; the voice code itself uses only
  expo-audio 57 and expo-file-system (already in the app).
- After a reconnect, a reply that finished while the app was offline is not replayed over the socket; it is in the
  conversation (reload it).

## 3a. Full duplex on the web (hands-free, interruptible)

Tap the mic once: voice is **on** until it is tapped again (or **End**). No tapping per sentence.

- **Turn taking in the browser** (`fe-byajbazaar/lib/voice/turnDetector.ts`, tested in `turnDetector.test.ts`): a
  turn starts after 0.2 s of speech clearly above the room's level (the quietest moment of the last 2 s — steady fan
  or traffic noise becomes the floor) and ends after 1 s of quiet; 0.5 s of audio from before the start is sent with
  it, so the first syllable is not lost. A click or bump (< 0.25 s) is dropped, not transcribed. 29 s at most.
- **Barge-in:** talking while the assistant speaks stops it at once (the app silences its player; the gateway stops
  making speech and drops audio still on the way). To keep the assistant from interrupting itself, the app compares
  the microphone with what is playing, learns how much of its own voice comes back (little with the browser's echo
  cancellation, more on speakers without it) and needs the person to be 3× louder than that, for 0.3 s.
- **Newer words win:** a reply that comes back while the person is talking again is held; if those words were
  speech it is not read out (it stays as text — `assistant.audio.skipped`, reason `interrupted`) and the new words
  are answered; if they were only noise it is read out after all.
- **Talking right after the tap** works: speech heard while the session is still starting is kept and sent the
  moment it is ready.
- **Off by itself** after 90 s with nobody talking and nothing to say, when the tab is hidden, at the 15-minute
  session limit, or when the connection is lost for good — with a one-line note.
- The bar shows Listening / the live transcript / Thinking / Speaking, with **Stop** (silence this reply), mute
  (replies as text only) and **End**.
- **Progress while waiting** (`lib/voice/voiceProgress.ts`, tested): starting — "Opening the microphone…",
  "Starting a voice session…" (or "The server is busy — trying again…": a 502 / 503 / 504 from the API is retried
  twice), "Connecting to the voice service…"; a question — "Writing down what you said…", then the assistant's live
  step when the app gets one (`aiProgress` on the notifications socket, e.g. "Looking up loans…") or what it usually
  does by then ("Understanding your question…", "Checking your shop's records…", "Preparing the answer…", "Almost
  there…"), then "Getting the voice ready…" — each with a bar and a percentage. The percentages are estimates from
  the measured timings: they move quickly, then slow down, and never reach 100 before the step is done. Typed
  questions get the same label with a percentage and seconds under the message.
- **Hindi voice warming up:** when the session answer says `hindiVoice` (and replies can be Hindi), a strip shows
  "Hindi voice warming up — starting a GPU for it… About 3 min." with a bar, then "almost ready — loading the voice"
  when the worker has connected, then "Hindi voice is ready" for a few seconds. The app sends `hindiVoice: true` in
  `session.start` and the gateway reports `voice.status` (`waiting` / `warming` / `ready`) from the hub — checked
  every 5 s until ready, then every 30 s. `unavailable`: one line saying Hindi replies are shown as text and that
  "Reply in: English" is read aloud. A spoken question that failed (e.g. took too long) has **Retry** (sent as text).
- The site must allow the microphone: `Permissions-Policy: microphone=(self)` (`fe-byajbazaar/next.config.ts`).
- **From any screen:** the microphone in the command bar (the floating "Ask ByajBazaar AI" button, Ctrl / ⌘ K) opens
  `/ai?voice=1` and the same voice conversation starts there. The tap unlocks the audio first
  (`lib/voice/audioUnlock.ts`; iOS only starts audio from a tap), and the AI page takes that unlocked audio over. It
  replaced the browser's own `SpeechRecognition` dictation, which sent audio to Google, failed in Brave and Firefox,
  and only filled the text box.

## 4. Protocol (bb.voice.v1)

Source of truth: `cloudflare/voice-gateway/src/protocol.ts`, copied to both apps by `npm run sync-protocol`
(`npm run check-protocol` fails when a copy is stale). JSON text frames for control, binary frames for audio.

| App → gateway | |
| --- | --- |
| `session.start` / `session.update` | conversation id, speech language, speak replies, voice, screen; `hindiVoice: true` = send `voice.status` |
| `audio.start` → binary frames → `audio.end` / `audio.cancel` | one utterance (`utteranceId`, `format: pcm16`, sample rate) |
| `text.message` | typed text over the socket; with `utteranceId` = the confirmed text of an unsure transcript |
| `assistant.interrupt`, `session.end`, `ping` | |

| Gateway → app | |
| --- | --- |
| `session.ready` | limits, `resumed`, `lastClientSeq` (resend newer events) |
| `transcript.partial`, `transcript.final` | `uncertain: true` + `no_speech` / `low_confidence` → nothing was sent; the app asks |
| `assistant.thinking`, `assistant.text.delta` (one, final), `assistant.response` | the API's chat response, previews included |
| `assistant.audio.start` → binary MP3 frames → `assistant.audio.end`; `assistant.audio.skipped` | per sentence |
| `voice.status` | `hindi: waiting / warming / ready` — the GPU voice for Hindi replies, sent when it changes |
| `assistant.interrupted`, `assistant.error`, `session.closed`, `pong` | |

Every event has a `seq`; the gateway ignores an app event it has already handled (resends after a reconnect are
safe). `utteranceId` / `messageId` also make the API turn idempotent (a repeat returns the first answer).

## 5. Security

- Sessions are created only through the signed-in API (shop from `X-Shop-Id`, role checks, paywall). The ticket
  carries the session, shop and person; neither the app nor the gateway can choose them.
- Gateway → API calls need the gateway key **and** a genuine, unexpired ticket; the session row must be open and
  match. Access is re-read on every turn.
- No audio is stored anywhere. The original transcript is kept next to the cleaned-up message for audit, and
  dropped after `AI_VOICE_TRANSCRIPT_RETENTION_DAYS` (default 30) by the daily purge; conversations follow the
  existing 90-day retention.
- Limits: 2 open sessions per person (a new one replaces the oldest), 5 per shop, 30 minutes of speech per person
  and 120 per shop per day, 30 s / 2 MB per utterance, 60 audio frames/s and 20 typed messages/min per session,
  400 spoken characters per reply, 2-minute idle timeout, 15-minute sessions. Web origins are allow-listed
  (`ALLOWED_ORIGINS`).
- Unsure transcripts that contain numbers or weights are never sent on their own: the person checks them first.

## 6. Usage and costs

`ai_voice_sessions` (AI database) holds per session: speech ms, partial-transcript ms, speech-to-text requests /
latency / errors, spoken characters, text-to-speech requests / latency / errors, turns. `GET /api/v1/ai/voice/usage`
shows today's minutes (and the shop total to its owner). Language-model tokens stay in `ai_usage_logs` as before.
Workers AI calls are tagged `shop:<id>`; set `AI_GATEWAY_ID` to also log them in AI Gateway.

Hindi replies spoken on Kaggle cost no Cloudflare money but use the accounts' weekly GPU hours: a worker kept warm for
the assistant runs for the voice session plus up to the "Keep warm" time (admin → Kaggle, default 45 min).

Per spoken English turn (≈ 5 s of speech, a 150-character spoken reply):

| Part | Cost |
| --- | --- |
| Speech-to-text (with live transcripts) | ≈ $0.0001 |
| Assistant (unchanged) | ≈ $0.0007 |
| Spoken reply (Aura-2) | ≈ $0.0045 |
| **Total** | **≈ $0.005** (≈ $0.0008 with spoken replies off) |

Speaking the reply is ~85% of the cost. A shop doing 100 spoken turns a day ≈ $15 a month. The gateway uses one
Cloudflare account through its AI binding (not the account pool), so expect a Workers Paid plan; Durable Object
time while sockets are open is extra (small: sessions are short).

## 7. Setting it up

1. Generate two random secrets (≥ 32 characters), e.g. `openssl rand -base64 48`.
2. API (`.env.<stage>` → SSM `ai-config`): `AI_VOICE_GATEWAY_URL=wss://voice.byajbazaar.com`,
   `AI_VOICE_TICKET_SECRET=…`, `AI_VOICE_GATEWAY_KEY=…`. Deploy; post-deploy runs migration `1801000000003`.
3. Gateway (the deploy also creates the `TtsHub` Durable Object, migration `v2`): `cd cloudflare/voice-gateway && npm install`, then
   `npx wrangler secret put VOICE_TICKET_SECRET --env production` and `… VOICE_GATEWAY_KEY …` (same values),
   check `BACKEND_URL` / `ALLOWED_ORIGINS` in `wrangler.toml`, and `npm run deploy:production`.
4. Check the gateway answers on its domain: `curl https://voice.byajbazaar.com/health` must return
   `{"ok":true,"protocol":"bb.voice.v1"}` — an HTML page means the domain still points at the website (§9).
5. The mic button appears when `GET /api/v1/ai/status` returns `voice: true`.
6. Hindi speech: nothing extra — warm workers started **after** this deploy carry the voice lane (running ones finish
   with the old notebook). `AI_VOICE_KAGGLE_TTS=false` turns it off.

Optional: `AI_VOICE_SESSION_MINUTES`, `AI_VOICE_DAILY_MINUTES`, `AI_VOICE_SHOP_DAILY_MINUTES`,
`AI_VOICE_MAX_CONCURRENT_PER_SHOP`, `AI_VOICE_MAX_SPOKEN_CHARS`, `AI_VOICE_TRANSCRIPT_RETENTION_DAYS`,
`AI_VOICE_CONFIRM=false` (no spoken confirmations), `AI_VOICE_ENABLED=false`; gateway vars `STT_MODEL`,
`TTS_MODEL`, `TTS_DEFAULT_VOICE`, `PARTIAL_TRANSCRIPTS`, `AI_GATEWAY_ID`, and the timing limits in `src/models.ts`.

## 7a. Logs

- **Gateway** (Cloudflare dashboard → Workers → `byajbazaar-voice-gateway-production` → Logs, or
  `npx wrangler tail --env production --format json`): one JSON line per step, with the session and shop ids —
  `session.connected` / `session.start` / `session.closed` (reason, turns, seconds), `stt` (outcome ok / no_speech /
  unsure / silent / timeout / error, ms, audio ms, language), `turn` (ok or the error code, ms, how the reply is
  spoken), `tts` (engine cloudflare / kaggle, outcome spoken / fallback / unavailable / skipped + reason, first-audio
  ms, segments), `hindi.status`, `error`; the hub: `hub.worker.connected` / `disconnected`, `hub.worker.engine`
  (voice engine up), `hub.speak.no_worker` (with counts), `first_audio`, `done`, `failed`. Never what was said or
  answered (lengths only).
- **API** (CloudWatch, `byajbazaar-backend-<stage>-api`): `Hindi voice: …` (a worker is up / booting / asked for / none
  can start, with the reason), `Assistant voice: …` (`warmForAssistant`: already up, booting, no account can start one
  — each account's reason —, could not start, giving up), `Warm GPU worker started for ByajBazaar AI voice` (with the
  try number), `Warm GPU worker reported in` (seconds from the push), `Warm GPU worker still booting` (Kaggle's state,
  minutes), `Warm GPU worker did not boot` (reason, whether the account rests), `AI queue job done` /
  `AI queue job failed` (type, ms, result).
- **Browser:** off by default (clean console). In the browser console: `localStorage.setItem('bb:voice-debug', '1')`,
  reload — `[voice] …` lines with ids and timings (microphone, session, retries, connection, heard / answered /
  speaking ms, not spoken + reason, Hindi voice, errors); `localStorage.removeItem('bb:voice-debug')` turns it off.
  Always on in development.

## 8. Tests and what still needs real audio

- `Backend`: `yarn test` → `test/ai/voice.test.ts` (tickets, limits, tenant isolation, voice ↔ text continuity,
  spoken confirm / cancel rules, duplicates, transcript clean-up, what is spoken).
- `cloudflare/voice-gateway`: `npm test` (session logic with fakes: transcripts, partials, silence, unsure
  transcripts, duplicates, interrupt, barge-in, full duplex — replies held, dropped or read out; timeouts,
  reconnection, limits, expiry; protocol, tickets signed the API's way, WAV, providers, API client, binary frames
  received in order, the shared app client) and `npm run typecheck`.
- `fe-byajbazaar`: `npx vitest run --project unit` → `lib/voice/turnDetector.test.ts` (turn start / end, pauses,
  clicks, noisy rooms, echo with and without echo cancellation, barge-in) and `lib/voice/voiceProgress.test.ts`
  (progress labels and estimates; the Hindi warm-up).
- `Backend`: `test/ai/voice-worker-boot.test.ts` — the boot watch (`bootCheck`; queued / failed workers replaced on
  another account, tries limited, a worker that reported in is not taken for one without internet).
- `Backend`: `test/ai/voice-kaggle.test.ts` also covers the prewarm (queue delivery → job, when a worker is asked for,
  which warm sessions can speak, English replies start nothing); `test/ai/error-body.test.ts` the error body keeping
  its code. Gateway: Hindi voice status (`voice.status`), the logs (never the words), the API error body.
- **End to end (Nov 2026):** a real browser (local web app) with a recorded voice as its microphone, the gateway in
  `wrangler dev` (real Workers AI) and the production API, account set to reply in English: speech while starting was
  kept and answered, questions were transcribed word for word, replies were spoken, talking over a reply stopped it
  and the new question was answered, the conversation continued hands-free. Two runtime bugs the unit tests could not
  see were found and fixed there: binary frames arrive as `Blob` in Workers (read as zero bytes → every utterance
  "silent"; now `src/socket-inbox.ts`), and the API client called the global `fetch` as a method ("Illegal
  invocation" → every turn `AI_UNREACHABLE`).
- **Not yet verified:** the deployed gateway (production domain), Hindi speech through a warm Kaggle worker, real
  rooms and devices (echo on speakers, phones), transcription quality per language (Hindi, Gujarati, Marathi) and
  jewellery words; the `MIN_CONFIDENCE` (0.45) / `MAX_NO_SPEECH` (0.6) thresholds; Aura-2's pronunciation of Indian
  names and amounts; iOS / Android audio routing. Record ~10 real shop-staff clips per language and run them through
  a staging session before relying on voice.

## 9. Troubleshooting

| What you see | Cause | Fix |
| --- | --- | --- |
| "Starting voice…" then "Reconnecting voice…" forever; console: `WebSocket … failed`, `Unexpected response code: 200` | `voice.byajbazaar.com` answers with the website: the gateway is not deployed on that domain | `npm run deploy:production` in `cloudflare/voice-gateway`; `/health` must return JSON (§7) |
| "Microphone is blocked…" although the browser allows it | the page's `Permissions-Policy` forbids the microphone | `microphone=(self)` in `next.config.ts`, redeploy the web app |
| Every utterance comes back as nothing heard | binary frames read as zero bytes (gateway older than the `socket-inbox` fix) | redeploy the gateway |
| Every turn "Could not reach the assistant" (`AI_UNREACHABLE`) | gateway older than the `fetch` fix, or `BACKEND_URL` wrong | redeploy the gateway; check `BACKEND_URL` |
| Transcripts appear but nothing is read aloud, replies in Hindi ("The voice is busy or still starting") | Hindi is spoken only by a warm Kaggle worker. Before the Nov 2026 fix the `voice.prewarm` job always failed (`toJob` had no case for it), so no worker was ever started | deploy the API; the app then shows the warm-up (§3a). If no worker starts (admin → Kaggle shows nothing running, accounts' "last assigned" does not move): API logs `Hindi voice:` / `Assistant voice:` say why (§7a) |
| Hindi voice "warming up" for a long time; admin → Kaggle shows a worker "starting" for many minutes | Kaggle has not run the notebook (queued: no GPU for the account) or it cannot reach the API. Before the boot watch nobody checked for 25 min | deploy the API: it is replaced on another account within ~8 min. Admin health → the worker's `kaggleState` / the account's last error say which; `queued` on every account = Kaggle has no T4 GPUs free right now (wait); `running` but never reported in = turn on internet / verify the phone on that Kaggle account; open `kaggle.com/code/<account>/byajbazaar-worker-<slot>` for the notebook's log |
| "The assistant could not answer" (`HTTP_504`) after ~20 s | the model call took longer than `AI_LLM_TIMEOUT_MS` (was 15 s), and the API's error body dropped its code (`AI_TIMEOUT`), so the message was lost too | deploy the API (20 s per call; codes kept) and the gateway (reads the message; a 504 is `AI_TIMEOUT`); the person can tap Retry |
| Random `503 {"message":"Service Unavailable"}` on many API calls at once | AWS Lambda concurrency limit (a burst of ~20 requests is throttled) | raise "Concurrent executions" in AWS Service Quotas (Lambda) |
