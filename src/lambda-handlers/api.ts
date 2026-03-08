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

let cachedServer: Handler;

async function bootstrap(): Promise<Handler> {
  if (cachedServer) {
    return cachedServer;
  }

  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

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
    const apiConfig = config.get<IApiOptions>('apiConfig');

    if (!apiConfig) {
      throw new Error('API configuration not found');
    }

    // Swagger configuration
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Byajbazaar')
      .setDescription('The Byajbazaar description')
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

    await app.init();

    // Get the Express app instance from NestJS (created internally, no deprecated access)
    const expressApp = app.getHttpAdapter().getInstance();

    cachedServer = serverlessExpress.default({ app: expressApp });

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
    const server = await bootstrap();
    const result = await server(event, context, callback);
    return result;
  } catch (error: any) {
    const requestPath = event?.path || event?.requestContext?.http?.path || 'unknown';
    console.error('❌ Lambda handler error:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      requestId: context.awsRequestId,
      path: requestPath,
      method: event?.requestContext?.http?.method || event?.httpMethod || 'unknown',
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
          path: requestPath,
        }),
      }),
    };
  }
};
