# Cloudflare AI accounts (try-on & background removal)

> How the backend uses several Cloudflare accounts for Workers AI, how to add them in the admin app, and where the
> logs go.

## 1. In plain words

Virtual try-on and inventory background removal run on **Cloudflare Workers AI** with **FLUX.2 [klein] 9B**
(`@cf/black-forest-labs/flux-2-klein-9b`). Every Cloudflare account gets a free daily allocation of Workers AI
"neurons". With several accounts, requests take turns across them, so together they do more work per day.

Accounts are managed like the Kaggle accounts: **Admin → Cloudflare AI accounts** (`/admin/cloudflare`).

There is **no klein 4B any more**. Try-on, outfit recolour, marketing images and background removal all use 9B. An
old request or env value that names 4B is quietly upgraded to 9B (`resolveCloudflareTryOnModelId`).

## 2. How a request picks an account

```
try-on / background removal
   │
   ▼
CloudflareAccountPool.credentials()        src/infrastructure/ai/services/cloudflare-account-pool.service.ts
   │  1. cloudflare_accounts has rows?  yes → enabled ones that are not resting
   │                                    no  → CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN (fallback)
   │  2. start one further than the last request (round robin)
   ▼
CloudflareTryOnService                      src/infrastructure/ai/services/cloudflare-try-on.service.ts
   │  try the first account; on failure:
   │    quota used up (429 "neurons")  → account rests until 00:00 UTC, next account
   │    token rejected (401/403)       → account rests 1 hour, next account
   │    anything else (5xx, timeout)   → account goes to the back of the queue, next account
   ▼
every call → activity log (logs database) + last used / last error on the account row
```

- Attempts per request: number of accounts + `CLOUDFLARE_TRYON_MAX_RETRIES`.
- The account list is cached for 30 seconds per server. A change in admin takes effect at once on the server that
  handled it, and within 30 seconds everywhere else (for example the try-on Lambda).
- If every account is resting, the request fails at once with a clear message ("add another account or try after
  00:00 UTC").

## 3. Adding accounts (step by step)

1. In Cloudflare, open the account → copy the **Account ID** (32 characters, also in the dashboard URL).
2. **My Profile → API Tokens → Create Token → "Workers AI"** template (Read + Edit) for that account. Copy the token.
3. In the app: **Account → Cloudflare AI accounts → Add accounts**. Paste the ID and token, add a note (owner).
   The backend checks the token against Workers AI first (`GET /accounts/<id>/ai/models/search`).
4. Several at once: **Paste several**, one per line: `accountId,token,note`.
5. Already using the env settings? The page shows an **Import** banner: it copies the `CLOUDFLARE_*` pairs into the
   table. From then on the env values are ignored (they are only used while the table is empty).

Per account you can **Check token**, **Disable/Enable**, **Replace token**, **Use now** (end a rest early) and
**Remove**. Tokens are stored as **plain text** in the database (column `api_token`) and never returned by the API; the UI shows `cfat…9f3a`. Anyone with database access can read them — restrict database access and rotate a token if it leaks.

## 4. Where things are stored

| What | Where |
| --- | --- |
| Accounts (ID, token in plain text, enabled, rest-until, last error, last used) | main DB, table `cloudflare_accounts` (migration `1794800000000-CreateCloudflareAccounts`) |
| **Logs**: every call (success/failure, operation, model, duration), every rest, every admin change | **logs database only**, `activity_logs`, category `CLOUDFLARE`, entity `cloudflare_account` |

Logs are written through `ACTIVITY_LOGGER` (`src/logs`), never into a main-database table of their own. Tokens are never
logged. Read them in the page's **Activity** tab (or per account under *Recent activity*), or with the API:

```
GET /api/v1/logs/admin/activity?category=CLOUDFLARE&entityId=<account row id>
```

Actions: `CLOUDFLARE_CALL_SUCCEEDED`, `CLOUDFLARE_CALL_FAILED`, `CLOUDFLARE_ACCOUNT_COOLING_DOWN`,
`CLOUDFLARE_ACCOUNT_ADDED`, `_UPDATED`, `_REMOVED`, `_VERIFIED`, `_COOLDOWN_CLEARED`.

## 5. Code map

| Layer | File |
| --- | --- |
| Admin API `admin/cloudflare-accounts` | `src/application/features/cloudflare-accounts/` (controller, service, models, ports) |
| Ports | `ICloudflareAccountsRepository` (`CLOUDFLARE_ACCOUNTS_REPOSITORY`), `ICloudflareAccountPool` (`CLOUDFLARE_ACCOUNT_POOL`) |
| Rotation, cooldowns, usage logs | `src/infrastructure/ai/services/cloudflare-account-pool.service.ts` |
| Workers AI calls | `src/infrastructure/ai/services/cloudflare-try-on.service.ts` |
| Table | `src/infrastructure/persistence/entities/cloudflare-account.entity.ts`, `repositories/cloudflare-accounts.repository.ts` |
| Admin UI | `fe-byajbazaar/components/admin/cloudflare/`, `hooks/useAdminCloudflare.ts`, route `/admin/cloudflare` |

## 6. Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| "Cloudflare rejected the token…" when adding | Wrong account ID, or the token lacks Workers AI permission on that account. |
| Account shows **Resting** | Daily free quota used up (back at 00:00 UTC = 5:30 IST) or token rejected (1 h). Add more accounts, or **Use now**. |
| **Re-enter token** | No token is stored for the account. Replace the token. |
| "All Cloudflare accounts are resting" | Every account is out of quota → add accounts or upgrade one to Workers Paid. |
| Page says "Using N account(s) from server settings" | The table is empty, so env values are used. Click **Import**. |
