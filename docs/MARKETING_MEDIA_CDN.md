# Marketing media CDN (`media.byajbazaar.com`)

> How marketing images and videos reach the browser, Instagram and the Kaggle notebooks — and how to set it up.

## 1. In plain words

Marketing files (campaign scenes, photoshoot shots, reels, brand logos, Instagram post images) live in a **private**
Backblaze B2 bucket, `byajbazaar-marketing-bucket`. Nobody can read it directly.

A small **Cloudflare Worker** sits in front of it at `https://media.byajbazaar.com`. When someone opens a file, the
Worker fetches it from B2 with its own secret key, caches it at Cloudflare's edge, and returns it. The next visitor
gets it straight from the cache — fast, and B2 is not charged again.

This is the same Worker code as the inventory image CDN (`images.byajbazaar.com`), deployed a **second time** with
its own settings.

## 2. How a request flows

```
Browser / Instagram / Kaggle
        │  GET https://media.byajbazaar.com/campaigns/<user>/<campaign>/scene-0-1794….jpg?v=<etag>
        ▼
Cloudflare Worker  byajbazaar-media-worker-production
        │  1. Is the path allowed?  (campaigns/, brands/, photoshoots/, instagram/  +  jpg/png/webp/mp4/webm/mov)
        │     no → 404
        │  2. In the edge cache?    yes → return it (HIT)
        │  3. Signed GET to B2      → cache it → return it (MISS)
        ▼
Backblaze B2 (private bucket)
```

**Videos:** players ask for byte ranges (`Range: bytes=0-…`) so they can seek. On a cache miss the Worker passes the
range to B2 and answers `206 Partial Content`, then fetches the whole file in the background and caches it (up to
200 MB). Later range requests are served from the cache.

**Uploads do not use the CDN.** Notebooks and the app upload with presigned `PUT` URLs straight to B2.

## 3. The two Workers side by side

| | Image CDN | Media CDN |
|---|---|---|
| Config file | `cloudflare/image-worker/wrangler.toml` | `cloudflare/image-worker/wrangler.media.toml` |
| Domain | `images.byajbazaar.com` | `media.byajbazaar.com` |
| Bucket | `byajbazaar-backend-production-bucket` | `byajbazaar-marketing-bucket` |
| Allowed folders | `inventory/`, `users/shop-logos/` | `campaigns/`, `brands/`, `photoshoots/`, `instagram/` |
| File types | images | images + `mp4`, `webm`, `mov` |
| Caching | 1 day browser / 7 days edge (keys get reused) | 1 year, `immutable` (keys contain a timestamp, URLs carry `?v=`) |
| Backend setting | `IMAGE_CDN_URL` | `MARKETING_MEDIA_CDN_URL` |

Both use the same code: `cloudflare/image-worker/src/index.ts`. Its settings (`ALLOWED_PREFIXES`,
`ALLOWED_EXTENSIONS`, `CACHE_CONTROL`) come from the Wrangler config; the defaults keep the image CDN unchanged.

## 4. How the backend builds the links

1. Code asks the marketing storage for a file URL: `MarketingFileStorage.getUrlAsync(key)`
   (`src/marketing/infrastructure/storage/marketing-file.storage.ts`, built on `libs/file-storage/s3-file.storage.ts`).
2. If `MARKETING_MEDIA_CDN_URL` is set **and** the key starts with one of `MARKETING_MEDIA_CDN_PREFIXES`
   (`src/marketing/marketing.config.ts`), it returns `https://media.byajbazaar.com/<key>?v=<etag>`.
   The `?v=` version comes from a HEAD request (which also checks the file exists).
3. Otherwise it returns a signed B2 URL, exactly as before.

So the web app, Instagram publishing and the Kaggle notebooks all get CDN links automatically — no other code knows
about the CDN.

> `MARKETING_MEDIA_CDN_PREFIXES` (backend) and `ALLOWED_PREFIXES` (Worker) **must list the same folders**. If the
> backend makes a CDN link for a folder the Worker doesn't allow, that file returns 404.

## 5. Setting it up from scratch (step by step)

You need: Node.js, a Cloudflare login (`npx wrangler login`) on the account that owns `byajbazaar.com`, and a B2
application key that can **read** the marketing bucket (the same as `MARKETING_S3_AWS_*` in `.env.production`).

1. **Install the Worker's tools**
   ```bash
   cd cloudflare/image-worker
   npm install
   ```
2. **Deploy the media Worker** (this also creates the `media.byajbazaar.com` domain and DNS record)
   ```bash
   npm run deploy:media:production
   ```
3. **Give it the B2 key** (you will be asked to paste each value; never commit them)
   ```bash
   npx wrangler secret put B2_ACCESS_KEY_ID -c wrangler.media.toml --env production
   npx wrangler secret put B2_SECRET_ACCESS_KEY -c wrangler.media.toml --env production
   ```
4. **Check it with a real file** from the marketing bucket:
   ```bash
   curl -sI https://media.byajbazaar.com/brands/<userId>/logo-<timestamp>.jpg          # expect 200
   curl -sI -H "Range: bytes=0-1023" https://media.byajbazaar.com/<some>.mp4            # expect 206
   curl -sI https://media.byajbazaar.com/inventory/x.jpg                                # expect 404 (not allowed)
   ```
   A missing file must give **404**. A **502** means the Worker can't read B2 — the secrets are wrong.
5. **Switch the backend on** — only after step 4 works:
   ```env
   MARKETING_MEDIA_CDN_URL=https://media.byajbazaar.com
   ```
   in `.env.production`, then deploy the backend (`yarn sls:deploy:production`).
6. **Frontend:** `media.byajbazaar.com` is already allowed in `fe-byajbazaar/next.config.ts` (`images.remotePatterns`)
   for `next/image`.

Current state (Nov 2026): steps 1–4 are done and verified; `MARKETING_MEDIA_CDN_URL` is set in `.env.production`
and takes effect with the next backend deploy.

## 6. Common changes

### Serve a new marketing folder

1. Add it to `ALLOWED_PREFIXES` in **all three** environments of `wrangler.media.toml`, then
   `npm run deploy:media:production`.
2. Add it to `MARKETING_MEDIA_CDN_PREFIXES` in `src/marketing/marketing.config.ts`, then deploy the backend.

### Serve a new file type

Add the extension to `ALLOWED_EXTENSIONS` in `wrangler.media.toml` and redeploy the Worker.

### Turn the CDN off

Empty `MARKETING_MEDIA_CDN_URL` and deploy the backend. Links go back to signed B2 URLs; the Worker can stay.

### Watch live requests

```bash
cd cloudflare/image-worker
npx wrangler tail -c wrangler.media.toml --env production
```
Each request logs `{"path": …, "cache": "HIT" | "MISS", "status": …}`.

## 7. Things to know

- **Links are public and permanent.** Anyone with a link can open the file (signed B2 URLs used to expire). Paths
  contain random IDs, so they can't be guessed. This includes the uploaded source product photos
  (`campaigns/…/source.*`, `photoshoots/…/source.*`); to keep those private, remove `source.` files from the CDN.
- **Cache changes:** a URL never changes content (timestamped keys + `?v=`), so the 1-year cache is safe. If you ever
  overwrite a file under the same key, its etag changes and so does the `?v=`, so new links show the new file.
- **Wrangler is v3** in this folder and warns that it is outdated. It works; upgrading (`npm i -D wrangler@4`) is
  recommended.

## 8. Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| `502 Bad Gateway` | Worker can't read B2: wrong/missing `B2_ACCESS_KEY_ID` / `B2_SECRET_ACCESS_KEY` for the media Worker. |
| `503 Service Unavailable` | Worker env incomplete (bucket, endpoint or secrets missing). |
| `404` for a file that exists | Folder or extension not in the Worker's allow-lists, or the key is wrong. |
| App still shows `backblazeb2.com` links | `MARKETING_MEDIA_CDN_URL` not set, or the backend not redeployed, or the folder isn't in `MARKETING_MEDIA_CDN_PREFIXES`. |
| Video won't seek | Check `curl -I -H "Range: bytes=0-1"` returns `206` with `accept-ranges: bytes`. |
| `wrangler` says "Failed to fetch auth token" | Your login expired: `npx wrangler login`. |
