# Serverless Configuration

This directory contains the Serverless Framework configuration files organized by concerns following clean architecture principles.

## Directory Structure

```
serverless/
├── functions.yml   # Lambda function definitions (API + cron)
├── providers.yml   # AWS provider configuration
└── README.md
```

## Functions

### Post-Deploy (`functions.yml`)

Runs migrations + seeds after each deployment. Invoked automatically by deploy scripts.

- **Handler**: `dist/src/lambda-handlers/post-deploy.handler`
- **Manual**: `serverless invoke -f runPostDeploy --stage dev`

### API Function (`functions.yml`)

Defines the main API Gateway Lambda function that handles all HTTP requests.

- **Handler**: `dist/src/lambda-handlers/api.handler`
- **Events**: HTTP API Gateway (all routes)
- **Memory**: 512 MB
- **Timeout**: 30 seconds

### Cron Functions (`functions.yml`)

Defines scheduled Lambda functions triggered by AWS EventBridge.

#### Update Dues Cron (`updateDuesCron`)

- **Handler**: `dist/src/lambda-handlers/cron.handler`
- **Schedule**: Every 2 hours (`rate(2 hours)`)
- **Event input**: `detail.job` = `updateDues` (routes in handler)
- **Memory**: 1512 MB
- **Timeout**: 300 seconds (5 minutes)

#### Close Expired Loans Cron (`closeExpiredLoansCron`)

- **Handler**: `dist/src/lambda-handlers/cron.handler` (same handler; job is selected via `detail.job`)
- **Schedule**: Daily at 19:30 UTC (`cron(30 19 * * ? *)`) ≈ 01:00 Asia/Kolkata
- **Event input**: `detail.job` = `closeExpiredLoans`
- **Memory**: 1512 MB
- **Timeout**: 300 seconds (5 minutes)
- **Behavior**: Sets `status` to `Closed` for all **Open** loans where `created_at + tenure` (days / months / years per `tenure_type`) is on or before now.

#### Relay Logs Cron (`relayLogsCron`)

- **Handler**: `dist/src/lambda-handlers/cron.handler` (job selected via `detail.job` = `relayLogs`)
- **Schedule**: Every 30 minutes (`rate(30 minutes)`)
- **Memory / Timeout**: 1024 MB / 300 seconds (works within a 4-minute budget; the next run continues)
- **Behavior**: Logs service upkeep (`src/logs`). Moves logs waiting in the main-database `log_outbox` to the logs
  database, then continues copying the old main-database log tables (`bill_logs`, `transaction_logs`,
  `activity_logs`, `whatsapp_messages`). No-op when `LOGS_DB_HOST` is not set.

## Providers

### AWS (`providers.yml`)

Contains AWS-specific provider configurations and can be extended with additional IAM permissions, VPC configurations, or other AWS-specific settings.

## Adding New Functions

1. **Create function definition** in `serverless/functions.yml`:

```yaml
myNewFunction:
  handler: dist/src/lambda-handlers/my-new.handler
  description: 'Description of the function'
  timeout: 30
  memorySize: 256
  events:
    - httpApi:
        method: GET
        path: /my-endpoint
```

2. **Create handler** in `src/lambda-handlers/my-new.handler.ts`

## Adding New Cron Jobs

1. **Add to `serverless/functions.yml`**:

```yaml
myNewCron:
  handler: dist/src/lambda-handlers/cron.handler
  description: 'My new cron job'
  timeout: 300
  events:
    - schedule:
        rate: rate(1 hour)
        enabled: true
```

2. **Add a cron service** extending `BaseCronService` (see `src/infrastructure/cron/close-expired-loans.cron.service.ts`)
3. **Register** it in `src/infrastructure/cron/index.ts` and wire routing in `CronService.runAsync(job)`
4. **Pass `detail.job`** in the scheduled function `input` and read it in `src/lambda-handlers/cron.ts` via `getJobFromEvent`

## Database (Neon / external PostgreSQL)

Lambda reads `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, and `DB_NAME` from `.env.{stage}` via `serverless-dotenv-plugin`. No RDS is provisioned by this stack.

**Deploy** (builds, deploys, then runs migrations + seeds):

```bash
yarn sls:deploy:dev
```

**Post-deploy Lambda:** The `runPostDeploy` function runs migrations and seeds, invoked automatically after each deploy. Manual: `serverless invoke -f runPostDeploy --stage dev`

Set Neon connection details in `.env.dev` / `.env.production`:

```env
DB_HOST=ep-xxx-pooler.region.aws.neon.tech
DB_PORT=5432
DB_NAME=neondb
DB_USER=neondb_owner
DB_PASS=your-neon-password
```

## Environment Variables (SSM Parameter Store)

AWS caps a Lambda's environment at **4 KB**. A production deploy once failed at 4190 bytes, so application settings
are **not** Lambda environment variables any more.

**Where settings live:**

| Where | What | Built by |
| --- | --- | --- |
| Lambda env (`serverless/providers.yml`) | only `NODE_ENV`, `NO_COLOR`, `AWS_NODEJS_CONNECTION_REUSE_ENABLED`, `TRY_ON_LAMBDA_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_SSM_PATH` (~220 bytes) | — |
| SSM `/byajbazaar/<stage>/app-config/1..3` | every other key of `.env.<stage>` (DB, S3, tokens, Cloudflare, Redis, Google, Meta, Razorpay, …) | `serverless/app-config.js` |
| SSM `/byajbazaar/<stage>/marketing-config` | `MARKETING_*`, `KAGGLE_*` | `serverless/marketing-config.js` |
| SSM `/byajbazaar/<stage>/logs-config` | `LOGS_DB_*` | `serverless/logs-config.js` |
| SSM `/byajbazaar/<stage>/google-play-service-account-json` | the Google Play key file | set by hand |

**How it works:**

- `serverless-dotenv-plugin` runs with `include: []`, so it injects nothing into the Lambda env.
- On deploy, `app-config.js` reads `.env.<stage>` itself (never the deploying shell's environment) and packs the
  values into up to 3 JSON chunks of 4 KB (standard tier, free). Unused chunks hold `{}`.
- It also adds the defaults `providers.yml` used to give, and fails the deploy with a clear message if the
  settings ever outgrow 3 chunks.
- On cold start every handler calls `loadAppSettings()` (`libs/aws/app-settings.loader.ts`) before `NestFactory`.
  It reads all chunks in one `ssm:GetParameters` call and copies them into `process.env`; values already in the
  environment win.
- If SSM can't be read on Lambda, the cold start fails loudly instead of running without a database.
- Under `serverless-offline` it loads `.env.<stage>` from disk instead.

**What this means for you:**

- **To add a setting**, add it to `.env.<stage>` and redeploy; nothing else changes.
- **If the settings outgrow 3 chunks** (about 12 KB), the deploy says so: add `AppConfigParameter4` in
  `serverless.yml` and raise `PARTS` in both `app-config.js` and the loader.
- **Code must read `process.env` lazily** (in functions, config factories, `useFactory`), never at module top level
  or in decorator arguments, which are evaluated before the settings are loaded.
- **Security:** the parameters are `String` type, because CloudFormation can't create `SecureString`. That is the
  same exposure the Lambda env had. Access is limited by IAM to `/byajbazaar/*`.

## Best Practices

1. **Keep functions focused**: Each function should have a single responsibility
2. **Use appropriate timeouts**: API functions should have shorter timeouts (30s), cron jobs can have longer (300s)
3. **Memory allocation**: Start with 512MB and adjust based on CloudWatch metrics
4. **Environment-specific configs**: Use stages to manage different environments
5. **Resource organization**: Keep related resources together in the same file

## Logs database (`LOGS_DB_*`)

Bill history, transaction edit history, the WhatsApp message log and the dues / payments / marketing activity log live in their own PostgreSQL
database (`src/logs`, migrations table `logs_migrations`). Like the marketing settings, `LOGS_DB_*` are kept out of the
Lambda env: the deploy writes them to the SSM parameter `/byajbazaar/<stage>/logs-config` (`serverless/logs-config.js`)
and every Lambda loads it on cold start. Without `LOGS_DB_HOST`, logs stay in the main database exactly as before.

Moving existing logs (safe to repeat; the main database is only read):

```bash
yarn logs:migrate-data --env=.env.production            # dry run: row counts
yarn logs:migrate-data --env=.env.production --confirm  # logs DB migrations + copy + field-by-field verify
```

Each stream (bill / transaction / activity / whatsapp) switches to the logs database only after all its rows are copied;
post-deploy and `relayLogsCron` finish an interrupted copy and pick up rows written during the switch.
