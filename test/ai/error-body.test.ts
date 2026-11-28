/**
 * The API's error body keeps the exception's code: the apps and the voice gateway act on it (AI_DAILY_LIMIT, AI_TIMEOUT,
 * AI_VOICE_SESSION_ENDED …). It used to be dropped, so every AI error looked like "could not answer".
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GatewayTimeoutException, Logger, NotFoundException } from '@nestjs/common';
import { throwError } from 'rxjs';

import { GlobalResponseInterceptor } from '../../libs/interceptors/global-response.interceptor';

function errorBodyOf(error: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const sent: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  let done: () => void = () => undefined;
  const written = new Promise<void>((resolve) => (done = resolve));
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      sent.body = body;
      done();
    },
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', url: '/api/v1/ai/chat' }),
      getResponse: () => response,
    }),
  };
  // The interceptor writes the error response itself (its stream then never emits): wait for that write.
  const subscription = new GlobalResponseInterceptor()
    .intercept(context as never, { handle: () => throwError(() => error) })
    .subscribe();
  return written.then(() => {
    subscription.unsubscribe();
    return sent;
  });
}

describe('API error body', () => {
  Logger.overrideLogger(false);

  it('keeps the code next to the message', async () => {
    const { status, body } = await errorBodyOf(
      new GatewayTimeoutException({ code: 'AI_TIMEOUT', message: 'The assistant took too long. Please try again.' }),
    );
    assert.equal(status, 504);
    assert.equal(body.code, 'AI_TIMEOUT');
    assert.equal(body.message, 'The assistant took too long. Please try again.');
    assert.deepEqual(body.data, {});
  });

  it('errors without a code look as before', async () => {
    const { status, body } = await errorBodyOf(new NotFoundException('Voice session not found'));
    assert.equal(status, 404);
    assert.equal('code' in body, false);
    assert.deepEqual(body, {
      statusCode: 404,
      message: 'Voice session not found',
      error: 'Not Found',
      data: {},
    });
  });
});
