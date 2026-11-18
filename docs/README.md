# ByajBazaar docs — start here

New to the project? Read these in order.

| # | Doc | Read it to learn |
| --- | --- | --- |
| 1 | [CODE_STRUCTURE_CONVENTIONS.md](CODE_STRUCTURE_CONVENTIONS.md) | How the backend is organised (layers, folders, imports), the rules every change follows, and a step-by-step "add a feature" walkthrough. |
| 2 | [MARKETING_KAGGLE_PIPELINE.md](MARKETING_KAGGLE_PIPELINE.md) | How a product photo becomes AI campaign images, photoshoots, logos and an Instagram reel on free Kaggle GPUs: image modes, the notebooks, warm workers, the model cache, settings, deploy and troubleshooting. |
| 3 | [MARKETING_MEDIA_CDN.md](MARKETING_MEDIA_CDN.md) | How marketing images and videos are served from `media.byajbazaar.com` (Cloudflare Worker in front of the private B2 bucket), and how to set it up. |

Elsewhere in the repo:

| Doc | Covers |
| --- | --- |
| `../../cloudflare/image-worker/README.md` | The Cloudflare Worker code behind both CDNs (`images.` for inventory, `media.` for marketing). |
| `../../fe-byajbazaar/docs/VERCEL_WILDCARD_DOMAIN.md` | How `*.byajbazaar.com` shop subdomains reach the Vercel frontend while DNS stays on Cloudflare. |
| `../../fe-byajbazaar/docs/` (SEO files) | SEO and indexing work for the public site. |

## The system in one picture

```
                         ┌───────────────────────────── Cloudflare (DNS for byajbazaar.com) ──────────┐
 Browser / mobile app ──►│ www / *.byajbazaar.com ─► Vercel (Next.js frontend, fe-byajbazaar)          │
                         │ images.byajbazaar.com  ─► Worker ─► B2 main bucket (inventory, shop logos)   │
                         │ media.byajbazaar.com   ─► Worker ─► B2 marketing bucket (images, videos)     │
                         └──────────────────────────────────────────────────────────────────────────────┘
        │ API calls
        ▼
 AWS API Gateway + Lambda (NestJS backend, this repo) ──► Postgres (main DB + separate marketing DB)
        │                                            └──► WebSocket API (live progress to browsers)
        │ dispatch
        ▼
 Kaggle notebooks (T4 × 2 GPUs) ── marketing AI: Qwen3-VL, BiRefNet, FLUX.2 [klein], Wan 2.2
```

## Words you will see

| Term | Meaning |
| --- | --- |
| **Port** | An interface in the application layer (`i-*.ts`) that infrastructure implements. |
| **Barrel** | A folder's `index.ts` that re-exports its files (`export * from './…'`). |
| **Render job** | A marketing GPU task in `marketing_render_jobs` (images, video, logo, setup, warm worker). |
| **Warm worker** | A long Kaggle session that keeps models loaded and pulls jobs one after another. |
| **B2** | Backblaze B2, the S3-compatible object storage holding all files. |
| **Worker (Cloudflare)** | A small script on Cloudflare's edge — here, the image/media CDNs. Not the same as a warm worker. |

## Deploying, in short

| What | Command | Where |
| --- | --- | --- |
| Backend | `yarn sls:deploy:production` (build → deploy → post-deploy migrations) | `Backend/` |
| Image CDN Worker | `npm run deploy:production` | `cloudflare/image-worker/` |
| Media CDN Worker | `npm run deploy:media:production` | `cloudflare/image-worker/` |
| Frontend | Vercel (Git push / `vercel --prod`) | `fe-byajbazaar/` |

Settings live in `Backend/.env.<stage>`; values starting with `MARKETING_` or `KAGGLE_` reach the Lambdas through
one SSM parameter (`serverless/marketing-config.js`). Never commit keys or tokens.
