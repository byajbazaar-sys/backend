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

### API Function (`functions.yml`)

Defines the main API Gateway Lambda function that handles all HTTP requests.

- **Handler**: `dist/src/lambda-handlers/api.handler`
- **Events**: HTTP API Gateway (all routes)
- **Memory**: 512 MB
- **Timeout**: 30 seconds

### Cron Functions (`functions.yml`)

Defines scheduled Lambda functions triggered by AWS EventBridge.

#### Update Dues Cron

- **Handler**: `dist/src/lambda-handlers/cron.handler`
- **Schedule**: Every 2 hours (`rate(2 hours)`)
- **Memory**: 512 MB
- **Timeout**: 300 seconds (5 minutes)

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

2. **Update `CronService`** to include the new job execution logic

## Environment Variables

Environment variables are defined in the main `serverless.yml` under `provider.environment`. For sensitive values, use:

- **AWS Systems Manager Parameter Store**: `${ssm:/path/to/parameter}`
- **AWS Secrets Manager**: `${ssm:/path/to/secret~true}`

Example:
```yaml
environment:
  MONGO_URL: ${ssm:/crowdsay/${self:provider.stage}/database/url}
  JWT_SECRET: ${ssm:/crowdsay/${self:provider.stage}/jwt/secret~true}
```

## Best Practices

1. **Keep functions focused**: Each function should have a single responsibility
2. **Use appropriate timeouts**: API functions should have shorter timeouts (30s), cron jobs can have longer (300s)
3. **Memory allocation**: Start with 512MB and adjust based on CloudWatch metrics
4. **Environment-specific configs**: Use stages to manage different environments
5. **Resource organization**: Keep related resources together in the same file
