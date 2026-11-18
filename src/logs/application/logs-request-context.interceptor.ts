import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

import { channelFromUserAgent, LogsRequestContext, runWithLogsRequestContext } from './logs-request-context';

/**
 * Global interceptor: runs each HTTP handler with its caller in context. Guards run before interceptors, so the
 * authenticated user (req.user) is known here; public routes get a null actor.
 */
@Injectable()
export class LogsRequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context
      .switchToHttp()
      .getRequest<{ user?: { userId?: string }; headers?: Record<string, string | string[] | undefined> }>();
    const userAgent = req?.headers?.['user-agent'];
    const store: LogsRequestContext = {
      actorId: req?.user?.userId ?? null,
      channel: channelFromUserAgent(Array.isArray(userAgent) ? userAgent.join(' ') : (userAgent ?? '')),
    };
    return new Observable((subscriber) =>
      runWithLogsRequestContext(store, () => {
        const subscription = next.handle().subscribe(subscriber);
        return () => subscription.unsubscribe();
      }),
    );
  }
}
