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
3. Each utterance is streamed as 16 kHz PCM (web: AudioWorklet; mobile: expo-audio's audio stream). It ends after
   1.2 s of silence, a tap, 30 s, or 2 MB.
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
- **A worker for the assistant.** Starting a voice session queues `voice.prewarm`: if no warm worker is running or
  booting, one is started on a free account with the **existing rules** (free slot, GPU hours left, not resting —
  `MarketingRenderService.warmForAssistant`). Its first boot takes minutes (packages, model copy, engine start); until
  then Hindi replies are shown as text.
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
  conversation (just not spoken).
- **Echo:** while the assistant speaks, the microphone is off (tap to interrupt and talk). There is no
  talk-over-the-voice barge-in, to avoid the assistant hearing itself.
- **Confirming by voice** (saying "confirm") works for stock and customer previews only; loans, payments and
  deposits always need a tap on Confirm. A bare "haan" / "yes" never confirms anything.
- **Traditional units** (aana, ratti, bhar, masha) are kept as said and the assistant asks for grams or purity —
  never converts them. Tola (fixed at 11.664 g) is converted and the grams are stated.
- **Mobile** needs a new native build for the updated microphone permission text; the voice code itself uses only
  expo-audio 57 and expo-file-system (already in the app).
- After a reconnect, a reply that finished while the app was offline is not replayed over the socket; it is in the
  conversation (reload it).

## 4. Protocol (bb.voice.v1)

Source of truth: `cloudflare/voice-gateway/src/protocol.ts`, copied to both apps by `npm run sync-protocol`
(`npm run check-protocol` fails when a copy is stale). JSON text frames for control, binary frames for audio.

| App → gateway | |
| --- | --- |
| `session.start` / `session.update` | conversation id, speech language, speak replies, voice, screen |
| `audio.start` → binary frames → `audio.end` / `audio.cancel` | one utterance (`utteranceId`, `format: pcm16`, sample rate) |
| `text.message` | typed text over the socket; with `utteranceId` = the confirmed text of an unsure transcript |
| `assistant.interrupt`, `session.end`, `ping` | |

| Gateway → app | |
| --- | --- |
| `session.ready` | limits, `resumed`, `lastClientSeq` (resend newer events) |
| `transcript.partial`, `transcript.final` | `uncertain: true` + `no_speech` / `low_confidence` → nothing was sent; the app asks |
| `assistant.thinking`, `assistant.text.delta` (one, final), `assistant.response` | the API's chat response, previews included |
| `assistant.audio.start` → binary MP3 frames → `assistant.audio.end`; `assistant.audio.skipped` | per sentence |
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
4. The mic button appears when `GET /api/v1/ai/status` returns `voice: true`.
5. Hindi speech: nothing extra — warm workers started **after** this deploy carry the voice lane (running ones finish
   with the old notebook). `AI_VOICE_KAGGLE_TTS=false` turns it off.

Optional: `AI_VOICE_SESSION_MINUTES`, `AI_VOICE_DAILY_MINUTES`, `AI_VOICE_SHOP_DAILY_MINUTES`,
`AI_VOICE_MAX_CONCURRENT_PER_SHOP`, `AI_VOICE_MAX_SPOKEN_CHARS`, `AI_VOICE_TRANSCRIPT_RETENTION_DAYS`,
`AI_VOICE_CONFIRM=false` (no spoken confirmations), `AI_VOICE_ENABLED=false`; gateway vars `STT_MODEL`,
`TTS_MODEL`, `TTS_DEFAULT_VOICE`, `PARTIAL_TRANSCRIPTS`, `AI_GATEWAY_ID`, and the timing limits in `src/models.ts`.

## 8. Tests and what still needs real audio

- `Backend`: `yarn test` → `test/ai/voice.test.ts` (tickets, limits, tenant isolation, voice ↔ text continuity,
  spoken confirm / cancel rules, duplicates, transcript clean-up, what is spoken).
- `cloudflare/voice-gateway`: `npm test` (session logic with fakes: transcripts, partials, silence, unsure
  transcripts, duplicates, interrupt, barge-in, timeouts, reconnection, limits, expiry; protocol, tickets signed
  the API's way, WAV, providers, API client, the shared app client) and `npm run typecheck`.
- **Not yet verified, needs staging with real recordings:** transcription quality per language (Hindi, English,
  Hinglish, Gujarati, Marathi) and jewellery words; the `MIN_CONFIDENCE` (0.45) / `MAX_NO_SPEECH` (0.6) thresholds;
  Aura-2's pronunciation of Indian names and amounts; the live Workers AI calls themselves (shapes are taken from
  the official typings); iOS / Android audio routing. Record ~10 real shop-staff clips per language and run them
  through a staging session before relying on voice.
