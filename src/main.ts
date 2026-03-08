import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { IApiOptions, IMsConfig } from './configurations';
import { GlobalResponseInterceptor, isLocal } from '@shared-libs';
import { parse } from 'qs';
import { SeedingService } from './infrastructure/persistence/seeds/seeding.service';
import { CronService } from './infrastructure/cron';
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
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
  app.useGlobalPipes(new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalInterceptors(new GlobalResponseInterceptor());
  const config = app.get<ConfigService<IMsConfig>>(ConfigService);
  const apiConfig = config.get<IApiOptions>('apiConfig');
  if (!apiConfig) {
    throw new Error('API configuration not found');
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('byajbazaar Microservice')
    .setDescription('The byajbazaar Microservice API description')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter client user auth token',
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
