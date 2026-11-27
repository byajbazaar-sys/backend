import { HttpException } from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';

import { AiBusinessError } from '../../application';

/** Shared by the ByajBazaar adapters: the APIs' own validation, and their 4xx answers as messages people can act on. */

export const num = (value: unknown): number | null =>
  value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

export async function assertValid(dto: object): Promise<void> {
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (!errors.length) return;
  const messages = flatten(errors).slice(0, 5);
  throw new AiBusinessError(`Some details are not valid: ${messages.join('; ')}`, 'VALIDATION', messages);
}

function flatten(errors: ValidationError[]): string[] {
  return errors.flatMap((e) => [...Object.values(e.constraints ?? {}), ...flatten(e.children ?? [])]);
}

/** Inventory rules that say no (missing category, not found, conflict) become messages the person can act on. */
export async function businessCall<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof HttpException && err.getStatus() >= 400 && err.getStatus() < 500) {
      const response = err.getResponse();
      const raw = typeof response === 'string' ? response : (response as { message?: string | string[] }).message;
      const message = (Array.isArray(raw) ? raw.join('; ') : raw) || err.message;
      const status = err.getStatus();
      throw new AiBusinessError(
        message,
        status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : status === 403 ? 'FORBIDDEN' : 'VALIDATION',
      );
    }
    throw err;
  }
}
