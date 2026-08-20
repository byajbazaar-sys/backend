import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GlobalResponseInterceptor, isLocal } from '@shared-libs';
import { parse } from 'qs';

import { AppModule } from './app.module';
import { IApiOptions, IMsConfig } from './configurations';
import { CronService } from './infrastructure/cron';
import { SeedingService } from './infrastructure/persistence/seeds/seeding.service';
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
    bodyParser: false,
  });
  // Virtual try-on sends multiple base64 images in JSON; default Express limit is 100kb.
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });
  if (isLocal()) {
    const seedingService = app.get<SeedingService>(SeedingService);
    await seedingService.runAsync();
  }
  // Enable CORS for all origins
  app.enableCors({
    origin: '*',
    methods: 'GET,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  app
    .getHttpAdapter()
    .getInstance()
    .set('query parser', (str: string) => parse(str, { depth: Infinity }));
  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new GlobalResponseInterceptor());
  const config = app.get<ConfigService<IMsConfig>>(ConfigService);
  const apiConfig = config.get<IApiOptions>('apiConfig');
  if (!apiConfig) {
    throw new Error('API configuration not found');
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('byajbazaar Microservice')
    .setDescription(
      '## Authentication\n\n' +
        '**Web app (JWT):** Authorize **user** with the JWT from `POST /auth/login`.\n\n' +
        '**External apps (API access):**\n' +
        '1. On `POST /auth/api-token`, enter **x-api-key** and **x-api-secret** in the two header fields (do not also use Authorize for api-key on this request).\n' +
        '2. Copy `accessToken` from the response (`at_live_...`).\n' +
        '3. Authorize **user** with that access token (Bearer). Inventory and all other protected APIs use **user** only.\n',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Token',
        description:
          'JWT from login OR access token from POST /auth/api-token (at_live_...). Required for inventory, bills, customers, etc.',
      },
      'user',
    )
    .build();
  // Set global prefix with explicit path format
  const GLOBAL_PREFIX = 'api/v1/';
  app.setGlobalPrefix(GLOBAL_PREFIX, {
    exclude: [{ path: '', method: RequestMethod.GET, version: '' }],
  });
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestHeaders: true,
      tryItOutEnabled: true,
    },
  });

  await app.listen(apiConfig.port, apiConfig.host);

  const url = await app.getUrl();
  Logger.log(`Application is running on: ${url}`);
  Logger.log(`Swagger documentation: ${url}/api-docs`);
  await app.get(CronService).runAsync();
}

// mark promise as intentionally not awaited to satisfy no-floating-promises
void bootstrap();