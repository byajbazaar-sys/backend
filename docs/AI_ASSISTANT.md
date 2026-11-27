# ByajBazaar AI (assistant)

Shopkeepers and staff talk to the app in English, Hindi or Hinglish ("Create silver payal 5 gram 70% purity",
"Ramesh ne 1500 byaj diya cash", "aaj kiska byaj baaki hai"). The assistant understands the request, calls the right business operation, asks
for anything missing, and — for anything that changes data — shows a preview that is saved only when the person taps
**Confirm**. Code: `src/ai` (backend), `fe-byajbazaar/components/ai` + `/ai` page (web),
`mobile-byajbazaar/app/(tabs)/more/assistant.tsx` + `src/components/ai` (mobile).

## 1. Shape of the module

`src/ai` is a bounded context like `src/logs` and `src/marketing`:

| Layer | Folder | What lives there |
| --- | --- | --- |
| Domain | `application/domain` | Intents, action lifecycle, the command contract, response views, payload hashing. No I/O. |
| Ports | `application/ports` | Interfaces for the model, embeddings, vector index, queue, bucket, repositories and the ByajBazaar gateways. |
| Tools | `application/tools` | The tool registry and every tool (see §3). |
| Services | `application/services` | The orchestrator (one per message), confirm / cancel, conversations, knowledge (RAG), background jobs. |
| HTTP | `application/controllers` | `ai/*` endpoints (thin), the QStash delivery endpoint and the admin knowledge endpoints. |
| Infrastructure | `infrastructure/*` | Postgres (own DB), Qdrant, QStash, B2 storage, settings loader. |
| Adapters | `infrastructure/adapters` | **The only files that import ByajBazaar code**: inventory, customer, loan, transaction, item and deposit services; the Workers AI model and embeddings (Cloudflare account pool); WebSocket progress; activity log. |

Own resources, each falling back to what ByajBazaar already has, so nothing breaks when one is not set up:

| Resource | Setting | Falls back to |
| --- | --- | --- |
| Database (Neon) | `AI_DB_*`, migrations table `ai_migrations` | main database (tables prefixed `ai_`) |
| Model | Workers AI `AI_LLM_MODEL` (default `@cf/google/gemma-4-26b-a4b-it`), `AI_LLM_FALLBACK_MODEL` (default `@cf/meta/llama-4-scout-17b-16e-instruct`) | the Cloudflare account pool (no account → assistant answers 503) |
| Vector index (Qdrant) | `AI_QDRANT_URL`, `AI_QDRANT_API_KEY` | `QDRANT_URL` (the customer face-search cluster) |
| Embeddings | Workers AI `@cf/baai/bge-m3` (multilingual, 1024-d) | the Cloudflare account pool (rotation, quota cooldowns) |
| Bucket (B2) | `AI_S3_*` | main bucket, under `ai/` |
| Queue | `AI_QSTASH_*`, `AI_API_BASE_URL` | marketing's QStash account; without a queue jobs run in-process |

On Lambda all of these come from the SSM parameter `/byajbazaar/<stage>/ai-config` (`serverless/ai-config.js`),
loaded on cold start (`infrastructure/config/ai-settings.loader.ts`). See `.env.example` → "ByajBazaar AI".

## 2. One message, end to end

```
POST /api/v1/ai/chat  { message, conversationId?, clientMessageId, page? }
  UserAuthGuard + X-Shop-Id → AiActor { shopId, actorUserId, role, permissions }   (never from the model)
  AiOrchestratorService
    ├─ limits: message size, daily messages per person, throttle 20/min
    ├─ retried clientMessageId → stored answer (nothing runs twice)
    ├─ history: last 8 turns (+ summary of older ones), rebuilt from stored text / tool calls / results
    ├─ tools offered = registry.forActor(actor)   (a viewer never sees write tools)
    └─ loop ≤ 4 model calls, ≤ 8 tool calls, 24 s budget:
         model → tool call → registry lookup (unknown → refused) → permission → strict zod input
                 read tool  → runs now, result card
                 write tool → prepare(): missing fields → "ask the person"; several matches → "which one?";
                              complete → pending action (AWAITING_CONFIRMATION, payload hash, 15 min expiry)
  ← { intent, message.text, cards[], actions[] }
```

The model is a Workers AI chat model with function calling
(`infrastructure/adapters/byajbazaar-workers-ai-model.adapter.ts`), called on ByajBazaar's Cloudflare account pool:
accounts rotate per call, an account whose daily allocation is spent rests until 00:00 UTC, and every call is in the
pool's call log. Default **Gemma 4 26B A4B** — tool calling, 256K context, the best Hindi / Hinglish of the free-plan
models in ByajBazaar's own checks (inbox bot, marketing), and roughly 9k / 27k neurons per million input / output
tokens (Llama 3.3 70B: ~27k / 205k). A typical turn (two calls, ~3k tokens in, ~150 out each) costs about 60 neurons,
so one free account (10k neurons a day) covers roughly 150 turns a day. Reasoning is switched off and replies are
capped at 1024 tokens. A call the main model fails or rejects goes once to **Llama 4 Scout**.

Smaller models slip more than frontier ones, so the adapter and orchestrator absorb the common slips without another
model round: a tool call written as JSON text is read as a call (only when the whole reply is that JSON and the name
is an offered tool); arguments that are not JSON reach the strict schema as `{ _unparsed }` and are refused; numbers
sent as text, `null` / `""` for optional fields and enum values in the wrong case are repaired before validation
(`tools/ai-tool-input.ts`). Unknown keys are never dropped — `shopId` from the model is still refused. All tool
inputs are validated by our zod schemas whatever the model sends. Swapping model is one setting; swapping provider
is another `IAiLanguageModel` adapter — tools and services don't change.

## 3. Tools

| Tool | Module / level | Does |
| --- | --- | --- |
| `inventory.create` / `inventory.update` | inventory · edit | Preview a new item / a change (update checks the item still matches the preview). |
| `inventory.search` / `inventory.get` / `inventory.summary` | inventory · view | Stock lookups and totals. |
| `customers.search` | customers · view | By name or phone (the model sees only the last 4 digits of a phone). |
| `customers.create` | customers · edit | Preview a customer; warns when the phone or name already exists. |
| `loans.search` / `dues.list` | loans · view | A customer's loans or recent ones; unpaid dues. |
| `loans.create` | loans · edit | Preview a girvi loan: customer, pledged items (matched to the shop's item list), amount, rate, term. Built by the loans API's own `buildNewLoan`. |
| `payments.record` | loans · edit | Preview an interest / principal payment on a loan. |
| `deposits.search` | loans · view | Deposit accounts and balances. |
| `deposits.add` | loans · edit | Preview money deposited (opens an account when the customer has none, like the deposits API). |
| `reports.overview` | reports · view | Open loans, principal / interest due, overdue dues, deposits held, stock value. |
| `app.navigate` | — | Button to a screen (bills, orders, closing a loan, refunds, team…). |
| `knowledge.search` | — | Glossary and help (Qdrant). |

**Duplicate-payment protection** (loans, payments, deposits), on top of the one-execution guarantee below:
- the preview warns when the same amount (and type) was recorded on that loan / account in the last 24 hours, or the
  same loan was given to that customer;
- Confirm refuses when the same amount was recorded **after the preview was made** (someone used the screen, or a
  second phone) — the action fails with that message and nothing is saved;
- a payment carries the loan's version from the preview; the transaction service rejects it if the loan changed in
  between (any payment, edit or close).

## 4. Write actions: preview → confirm

```
PROPOSED → VALIDATED → AWAITING_CONFIRMATION ──Confirm──► APPROVED → EXECUTING → COMPLETED | FAILED
                                   ├──Cancel──► CANCELLED
                                   └──15 min──► EXPIRED
```

`POST /api/v1/ai/actions/:id/confirm { payloadHash }` runs the **stored** parameters (the client sends only the
hash) and only when:

1. the action belongs to this person in this shop (else 404);
2. it has not expired (410) and is still awaiting confirmation (409 otherwise; a completed one returns its result);
3. the hash the person saw = the stored hash = a fresh hash of the stored payload (409 if anything changed);
4. the person **still** has the tool's permission (403) — a role change after the preview counts;
5. the stored parameters still pass the tool's schema (422);
6. a compare-and-set moves it to EXECUTING (another request got there first → no second run), and the execution row's
   unique idempotency key blocks a duplicate even across Lambdas.

Execution calls ByajBazaar's own services through the adapter (same request models and `class-validator` rules as
the inventory API). Updates also check the item still has the values shown in the preview. The outcome is written to
`ai_audit_logs`, to ByajBazaar's activity log (category `AI`), and as an event in the conversation so the model knows
what happened next turn. Business rule failures → FAILED with the rule's message (422).

## 5. Security notes

- Tenant ids, user ids and roles come only from the authenticated request; tool inputs are strict objects, so a model
  sending `shopId` / `createdBy` is refused (`invalid_input`). Every gateway call is scoped by the actor's shop.
- `ai/*` is open to every shop member in the API's per-request check (`shop-permissions.ts`); each tool enforces its
  module at preview time and again at confirmation. `ai/admin/*` is platform-admin only.
- Tool results reach the model as JSON data; the system prompt says data is not instructions. Nothing the model writes
  is rendered as HTML (the web cards render plain text).
- Qdrant holds shared knowledge only; every search filters `scope ∈ {global, shopId}` and drops anything else.
  Business numbers (stock, dues, payments) always come from PostgreSQL through the services.
- The model sees minimised data: item cards without images, cost prices or suppliers. The provider gets a hashed,
  non-reversible user id only.
- Audit rows never contain message text. Conversations untouched for `AI_RETENTION_DAYS` (90) are deleted by the
  purge job; people can delete their own conversations.

## 6. Operating it

| Task | How |
| --- | --- |
| Migrations | `yarn ai:migration:up` locally; post-deploy runs them (a failure never blocks ByajBazaar). |
| Knowledge (first time / after editing `application/knowledge/seed-knowledge.ts`) | `POST /api/v1/ai/admin/knowledge/reindex` (admin) — builds a new collection version, then swaps the alias. |
| Add a help document | `POST /api/v1/ai/admin/knowledge/documents` (stored in the AI bucket, reindexed by the queue). |
| Retention purge | QStash schedule (daily) → `POST {AI_API_BASE_URL}/api/v1/ai/queue` body `{"type":"maintenance.purge"}`, or `POST /api/v1/ai/admin/maintenance/purge`. |
| Usage | `GET /api/v1/ai/usage` (person; shop total for the owner); `ai_usage_logs` has tokens per model call; neurons per account are in Admin → Cloudflare accounts. |
| All accounts out of allocation | Chat answers 429 `AI_QUOTA` ("back after 5:30 AM India time"); add another account in Admin → Cloudflare accounts. |

## 7. Adding a tool

1. Write it in `application/tools/<area>/…` — action id, intent, description, strict zod `input`, `output`,
   `permission { module, level }`, and either `run()` (reads) or `prepare()` + `parameters` + `execute()` (writes).
2. Put any ByajBazaar call behind a port in `application/ports/i-ai-byajbazaar.ports.ts` and implement it in an
   adapter that uses the existing service (never repositories or SQL).
3. Register it in `ai.module.ts` (registry factory) and cover it in `test/ai` (scripted model, in-memory fakes).

## 8. Progress, preferences, apps

- **Progress.** API Gateway's HTTP API returns a Lambda response in one piece, so the answer is not streamed token by
  token. Instead each step ("Reading your message…", "Checking loans…", "Writing the answer…") is pushed over
  ByajBazaar's WebSocket API as `{ type: 'aiProgress', clientMessageId, conversationId, step, label }` to the
  person's own connections in that shop (`byajbazaar-progress.adapter.ts`). The web and mobile screens show it in
  place of "Working on it…". Best effort: without a socket nothing changes.
- **Preferences.** `GET` / `PUT /api/v1/ai/preferences` `{ language: auto|en|hi|hinglish, replyStyle: short|detailed }`,
  per person across shops (table `ai_user_preferences`, migration `1801000000002`). Sent to the model in the per-turn
  context, so the system prompt stays the same for every request.
- **Voice.** Speak to the assistant (Hindi, English, Hinglish, Gujarati, Marathi) and hear English replies, through
  the Cloudflare voice gateway; spoken turns go through this same orchestrator and conversation. See
  [AI_VOICE.md](AI_VOICE.md) for the design, the models and the accepted limitations.
- **Apps.** Web: `/ai`, the ✨ button and Ctrl/⌘+K. Mobile: More → ByajBazaar AI. Both render the same typed cards
  (never HTML); card links are web paths, mapped to mobile screens by `mobileRouteFor` (unknown paths show no link).

## 9. Status

Done: module, own DB + migrations, Workers AI model on the account pool, conversations, chat / conversations /
actions / usage / preferences APIs, the tools in §3 with duplicate-payment protection, confirmation lifecycle, Qdrant +
embeddings + reindex, QStash jobs, B2 documents, WebSocket progress, web screen and mobile screen. Tests: `yarn test`
(`test/ai`).

Not in the assistant (it opens the screen instead): bills / POS, orders, editing or closing a loan, deposit refunds and
adjustments, team changes. Token-by-token streaming would need a Lambda Function URL with response streaming.
