import { AsyncLocalStorage } from 'node:async_hooks';

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

/** Runs `callback` with `context` as the current request context. */
export function runWithLogsRequestContext<T>(context: LogsRequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

/** Which app made the request, from the user agent (same rule as the bill history). */
export function channelFromUserAgent(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/okhttp|expo|reactnative|cfnetwork|darwin/.test(ua)) return 'mobile';
  if (/mozilla|chrome|safari|firefox|edg\//.test(ua)) return 'web';
  return 'api';
}
