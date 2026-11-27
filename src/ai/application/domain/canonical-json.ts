import { createHash } from 'crypto';

/**
 * JSON with object keys sorted at every level and `undefined` dropped, so the same value always gives the same
 * string (and the same hash), whatever order the keys were built in.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : normalize(item)));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (item !== undefined) out[key] = normalize(item);
  }
  return out;
}

/**
 * The fingerprint a confirmation is bound to: the exact action, its exact parameters, the shop and the person.
 * Anything that changes after the preview was shown gives a different hash, so an earlier approval never runs a
 * changed payload.
 */
export function actionPayloadHash(input: {
  action: string;
  parameters: Record<string, unknown>;
  shopId: string;
  actorUserId: string;
}): string {
  const body = canonicalJson({
    v: 1,
    action: input.action,
    parameters: input.parameters,
    shopId: input.shopId,
    actorUserId: input.actorUserId,
  });
  return createHash('sha256').update(body).digest('hex');
}
