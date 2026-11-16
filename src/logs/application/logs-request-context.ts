import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Observable } from 'rxjs';

/** Who is making the current HTTP request and from which app — the default "performed by" of activity logs. */
export interface LogsRequestContext {
  actorId: string | null;
  /** web | mobile | api */
  channel: string;
}

const storage = new AsyncLocalStorage<LogsRequestContext>();

export function currentLogsRequestContext(): LogsRequestContext | undefined {
  return storage.getStore();
}

/** Which app made the request, from the user agent (same rule as the bill history). */
export function channelFromUserAgent(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/okhttp|expo|reactnative|cfnetwork|darwin/.test(ua)) return 'mobile';
  if (/mozilla|chrome|safari|firefox|edg\//.test(ua)) return 'web';
  return 'api';
}

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
      storage.run(store, () => {
        const subscription = next.handle().subscribe(subscriber);
        return () => subscription.unsubscribe();
      }),
    );
  }
}
