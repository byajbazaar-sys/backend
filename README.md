# CrowdSay Backend

A NestJS-based backend application for CrowdSay, built with clean architecture principles and deployed on AWS Lambda using the Serverless Framework.

## Description

This is a progressive Node.js backend application built with the [NestJS](https://github.com/nestjs/nest) framework. The application follows clean/modular architecture principles with separation of concerns across application, infrastructure, and domain layers.

## Architecture

The project follows a clean architecture pattern with the following structure:

- **`src/application/`** - Application layer containing features, services, and business logic
- **`src/infrastructure/`** - Infrastructure layer containing persistence, external services, and cron jobs
- **`libs/`** - Shared libraries and utilities
- **`serverless/`** - Serverless Framework configuration files organized by concerns

## Project Setup

### Prerequisites

- Node.js 20.x or higher
- Yarn or npm
- AWS CLI configured with appropriate credentials
- Serverless Framework CLI

### Installation

```bash
# Install dependencies
$ yarn install

# Install Serverless Framework globally (optional)
$ npm install -g serverless
```

## Development

### Local Development

```bash
# Start development server with hot-reload
$ yarn run start:dev

# Start in debug mode
$ yarn run start:debug

# Start production build locally
$ yarn run build
$ yarn run start:prod
```

### Local Serverless Development

```bash
# Start serverless offline (simulates AWS Lambda locally)
$ yarn run sls:offline

# This will start the API at http://localhost:3000
# Swagger docs available at http://localhost:3000/api-docs
```

## Serverless Configuration

The project is configured for AWS Lambda deployment using the Serverless Framework with the following structure:

### Folder Structure

```
serverless/
├── functions/          # Lambda function definitions
│   ├── api.yml        # API Gateway function
│   └── cron.yml       # EventBridge cron function
├── resources/         # AWS resource definitions
│   └── eventbridge.yml # EventBridge rules and resources
└── providers/         # Provider-specific configurations
    └── aws.yml        # AWS provider configurations
```

### Functions

1. **API Function** (`api.handler`)
   - Handles all HTTP requests via API Gateway
   - Routes: All endpoints under `/api/v1/`
   - Handler: `dist/lambda-handlers/api.handler`

2. **Cron Function** (`updateDuesCron`)
   - Scheduled job triggered by AWS EventBridge
   - Schedule: Every 2 hours
   - Handler: `dist/lambda-handlers/cron.handler`
   - Executes: `UpdateDuesCronService` to update loan dues

### AWS EventBridge Configuration

The cron job is configured to run via AWS EventBridge with the following schedule:
- **Schedule Expression**: `rate(2 hours)`
- **Description**: Update dues cron job scheduled to run every 2 hours
- **Timezone**: Asia/Kolkata (configured in the cron service)

### Serverless Commands

```bash
# Deploy entire stack
$ yarn run sls:deploy

# Deploy to specific stage
$ yarn run sls:deploy --stage production

# Deploy to specific region
$ yarn run sls:deploy --region us-west-2

# Deploy single function (faster for development)
$ yarn run sls:deploy:function --function api

# Package without deploying
$ yarn run sls:package

# Remove entire stack
$ yarn run sls:remove

# View serverless info
$ yarn run sls info

# View logs
$ yarn run sls logs --function api --tail
$ yarn run sls logs --function updateDuesCron --tail
```

### Environment Variables

Environment variables can be configured in `serverless.yml` under the `provider.environment` section. For sensitive values, use AWS Systems Manager Parameter Store or AWS Secrets Manager:

```yaml
environment:
  DATABASE_URL: ${ssm:/crowdsay/${self:provider.stage}/database/url}
  JWT_SECRET: ${ssm:/crowdsay/${self:provider.stage}/jwt/secret}
```

### Stages

The application supports multiple deployment stages:
- `dev` - Development environment (default)
- `staging` - Staging environment
- `production` - Production environment

Deploy to a specific stage:
```bash
$ yarn run sls:deploy --stage staging
```

## Build

```bash
# Build the project
$ yarn run build

# The build output will be in the `dist/` directory
```

## Testing

```bash
# Run unit tests
$ yarn run test

# Run e2e tests
$ yarn run test:e2e

# Run test coverage
$ yarn run test:cov
```

## Deployment

### Prerequisites for Deployment

1. Configure AWS credentials:
```bash
$ aws configure
```

2. Ensure you have the necessary IAM permissions:
   - Lambda functions creation and management
   - API Gateway creation and management
   - EventBridge rule creation
   - CloudFormation stack management
   - IAM role creation

### Deployment Steps

1. **Build the application**:
```bash
$ yarn run build
```

2. **Deploy to AWS**:
```bash
# Deploy to dev (default)
$ yarn run sls:deploy

# Deploy to production
$ yarn run sls:deploy --stage production
```

3. **Verify deployment**:
```bash
# Get API endpoint
$ yarn run sls info

# Test the API
$ curl https://<api-id>.execute-api.<region>.amazonaws.com/api/v1/health
```

### Post-Deployment

After deployment, you'll receive:
- **API Gateway URL**: Base URL for all API endpoints
- **Lambda Function ARNs**: For each deployed function
- **EventBridge Rule**: Automatically created for the cron job

## Monitoring and Logs

### View Logs

```bash
# View API function logs
$ yarn run sls logs --function api --tail

# View cron function logs
$ yarn run sls logs --function updateDuesCron --tail

# View logs for specific time range
$ yarn run sls logs --function api --startTime 1h
```

### CloudWatch Metrics

Monitor your functions in AWS CloudWatch:
- Lambda invocations
- Error rates
- Duration
- Throttles
- EventBridge rule invocations

## Cron Jobs

The application includes a cron job service that runs on AWS EventBridge:

### Update Dues Cron Job

- **Service**: `UpdateDuesCronService`
- **Schedule**: Every 2 hours
- **Handler**: `src/lambda-handlers/cron.handler.ts`
- **Purpose**: Updates loan dues status and calculations

### Adding New Cron Jobs

1. Create a new cron service extending `BaseCronService`:
```typescript
@Injectable()
export class MyNewCronService extends BaseCronService {
  // Implement required methods
}
```

2. Add the function to `serverless/functions/cron.yml`:
```yaml
myNewCron:
  handler: dist/lambda-handlers/cron.handler
  events:
    - schedule:
        rate: rate(1 hour)
```

3. Update `CronService` to include the new job

## Project Structure

```
.
├── src/
│   ├── application/          # Application layer
│   │   └── features/         # Feature modules
│   ├── infrastructure/       # Infrastructure layer
│   │   ├── cron/            # Cron job services
│   │   └── persistence/     # Database repositories
│   ├── configurations/      # Configuration files
│   ├── lambda-handlers/     # Lambda function handlers
│   └── main.ts              # Local development entry point
├── libs/                     # Shared libraries
├── serverless/               # Serverless configuration
│   ├── functions/            # Function definitions
│   ├── resources/            # AWS resources
│   └── providers/            # Provider configs
├── serverless.yml            # Main serverless config
└── package.json
```

## API Documentation

Once deployed or running locally, Swagger documentation is available at:
- **Local**: `http://localhost:3000/api-docs`
- **Deployed**: `https://<api-gateway-url>/api-docs`

## Code Quality

```bash
# Run linter
$ yarn run lint

# Format code
$ yarn run format
```

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Serverless Framework Documentation](https://www.serverless.com/framework/docs)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [AWS EventBridge Documentation](https://docs.aws.amazon.com/eventbridge/)

## Support

For issues and questions, please contact the development team or create an issue in the repository.

## License

This project is proprietary and confidential.
