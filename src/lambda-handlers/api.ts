import { Context, Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ValidationPipe } from '@nestjs/common';
import { GlobalResponseInterceptor } from '@shared-libs';
import { ConfigService } from '@nestjs/config';
import { IMsConfig, IApiOptions } from '../configurations';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RequestMethod } from '@nestjs/common';
import { parse } from 'qs';
import * as serverlessExpress from '@vendia/serverless-express';
import { SeedingService } from '../infrastructure/persistence/seeds/seeding.service';

let cachedServer: Handler;

async function bootstrap(): Promise<Handler> {
  if (cachedServer) {
    console.log('Using cached server instance');
    return cachedServer;
  }

  try {
    // Let NestJS create the Express app internally (avoids deprecated app.router access)
    // This will also establish MongoDB connection
    console.log('Creating NestJS application...');
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log']
    });

    console.log('NestJS application created successfully');

    // Only run seeding if SKIP_SEEDING is not set to 'true'
    // In Lambda, seeding should typically be skipped as it runs on every cold start
    const skipSeeding = process.env.SKIP_SEEDING === 'true';

    if (!skipSeeding) {
      console.log('Running seeding service...');
      try {
        const seedingService = app.get<SeedingService>(SeedingService);
        // Run with timeout to prevent hanging
        const seedingPromise = seedingService.runAsync();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Seeding timeout after 15 seconds')), 15000),
        );

        await Promise.race([seedingPromise, timeoutPromise]);
        console.log('✅ Seeding completed successfully');
      } catch (error) {
        console.error('❌ Seeding service failed or timed out:', error.message);
        console.error('Stack:', error.stack);
        // Don't throw - allow Lambda to continue even if seeding fails
      }
    } else {
      console.log('⏭️  Seeding skipped (SKIP_SEEDING=true)');
    }

    // Enable CORS
    app.enableCors({
      origin: '*',
      methods: 'GET,PUT,PATCH,POST,DELETE',
      credentials: true,
    });

    // Query parser
    app
      .getHttpAdapter()
      .getInstance()
      .set('query parser', (str: string) => parse(str, { depth: Infinity }));

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    // Global interceptor
    app.useGlobalInterceptors(new GlobalResponseInterceptor());

    const config = app.get<ConfigService<IMsConfig>>(ConfigService);
    console.log('config', config);
    const apiConfig = config.get<IApiOptions>('apiConfig');

    if (!apiConfig) {
      throw new Error('API configuration not found');
    }

    // Swagger configuration
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CrowdSay Backend API')
      .setDescription('The CrowdSay Backend API description')
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

    console.log('Initializing NestJS application (app.init)...');
    await app.init();
    console.log('NestJS application initialized successfully');

    // Get the Express app instance from NestJS (created internally, no deprecated access)
    console.log('Getting Express app instance...');
    const expressApp = app.getHttpAdapter().getInstance();
    console.log('Express app instance retrieved');

    console.log('Creating serverless-express wrapper...');
    cachedServer = serverlessExpress.default({ app: expressApp });
    console.log('✅ Server bootstrap completed successfully');

    return cachedServer;
  } catch (error: any) {
    console.error('❌ Bootstrap error:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    throw error; // Re-throw to be caught by handler
  }
}

export const handler = async (event: any, context: Context, callback: any) => {
  // Set callbackWaitsForEmptyEventLoop to false to allow Lambda to freeze the event loop
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    console.log('Lambda handler invoked', {
      httpMethod: event?.requestContext?.http?.method || event?.httpMethod,
      path: event?.requestContext?.http?.path || event?.path,
      requestId: context.awsRequestId,
    });

    const server = await bootstrap();
    console.log('Server bootstrap completed, invoking handler...');

    const result = await server(event, context, callback);
    console.log('Handler execution completed successfully');
    return result;
  } catch (error: any) {
    console.error('❌ Lambda handler error:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      requestId: context.awsRequestId,
    });

    // Return a proper error response instead of letting it crash
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
        data: {},
        ...(process.env.NODE_ENV === 'development' && {
          details: error?.message,
        }),
      }),
    };
  }
};
