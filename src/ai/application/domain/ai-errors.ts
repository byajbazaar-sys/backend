/**
 * A business rule said no (validation, not found, conflict). The message is safe to show to the person and to the
 * model; it never carries stack traces or internals.
 */
export class AiBusinessError extends Error {
  constructor(
    message: string,
    readonly code: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN',
    readonly details?: string[],
  ) {
    super(message);
    this.name = 'AiBusinessError';
  }
}

/**
 * The model provider failed. `retryable` errors (timeouts, overload, rate limits) can be tried again later; `quota`
 * means every account's daily allocation is used up (back after 00:00 UTC).
 */
export class AiModelError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'rate_limit' | 'unavailable' | 'bad_request' | 'auth' | 'not_configured' | 'quota',
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AiModelError';
  }
}
