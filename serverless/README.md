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

## Environment Variables

Environment variables are defined in the main `serverless.yml` under `provider.environment`. For sensitive values, use:

- **AWS Systems Manager Parameter Store**: `${ssm:/path/to/parameter}`
- **AWS Secrets Manager**: `${ssm:/path/to/secret~true}`

Example:

```yaml
environment:
  DB_HOST: ${env:DB_HOST}
  JWT_SECRET: ${ssm:/crowdsay/${self:provider.stage}/jwt/secret~true}
```

## Best Practices

1. **Keep functions focused**: Each function should have a single responsibility
2. **Use appropriate timeouts**: API functions should have shorter timeouts (30s), cron jobs can have longer (300s)
3. **Memory allocation**: Start with 512MB and adjust based on CloudWatch metrics
4. **Environment-specific configs**: Use stages to manage different environments
5. **Resource organization**: Keep related resources together in the same file

