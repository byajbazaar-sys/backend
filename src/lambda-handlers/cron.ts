import { Context, Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CronService } from '../infrastructure/cron';

let cachedApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

async function bootstrap() {
  if (cachedApp) {
    return cachedApp;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  cachedApp = app;
  return app;
}

export const handler: Handler = async (event: any, context: Context) => {
  // Set callbackWaitsForEmptyEventLoop to false to allow Lambda to freeze the event loop
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const app = await bootstrap();
    const cronService = app.get<CronService>(CronService);

    console.log('Starting cron job execution...');
    await cronService.runAsync();
    console.log('Cron job execution completed successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Cron job executed successfully',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('Error executing cron job:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Cron job execution failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
