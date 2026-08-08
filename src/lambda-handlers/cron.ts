import { Context, Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CronService } from '../infrastructure/cron';

let cachedApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;

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

function getJobFromEvent(event: unknown): string {
  if (event === null || typeof event !== 'object') {
    return undefined;
  }
  const e = event as Record<string, unknown>;
  const detail = e.detail;
  if (detail !== null && typeof detail === 'object' && 'job' in detail) {
    const job = (detail as Record<string, unknown>).job;
    return typeof job === 'string' ? job : undefined;
  }
  return undefined;
}

export const handler: Handler = async (event: unknown, context: Context) => {
  // Set callbackWaitsForEmptyEventLoop to false to allow Lambda to freeze the event loop
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const app = await bootstrap();
    const cronService = app.get<CronService>(CronService);

    const job = getJobFromEvent(event);
    console.log('Starting cron job execution...', job ? { job } : { job: 'updateDues (default)' });
    await cronService.runAsync(job);
    console.log('Cron job execution completed successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Cron job executed successfully',
        job: job ?? 'updateDues',
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
