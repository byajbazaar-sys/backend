import { createHmac, timingSafeEqual } from 'crypto';

import type { VoiceTicketClaims } from './voice.types';

/**
 * Voice tickets: `v1.<base64url(JSON claims)>.<base64url(HMAC-SHA256(secret, "v1." + payload))>`. The voice gateway
 * verifies the same format with WebCrypto (cloudflare/voice-gateway/src/ticket.ts) — keep the two in step.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function signVoiceTicket(claims: VoiceTicketClaims, secret: string): string {
  if (!secret) throw new Error('Voice ticket secret is not set');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`v1.${payload}`).digest('base64url');
  return `v1.${payload}.${signature}`;
}

/**
 * The claims when the ticket is genuine and the session has not ended; null otherwise. `forConnect` also requires the
 * short connect window (used by the gateway when the app opens the socket; turns only need a live session).
 */
export function verifyVoiceTicket(
  ticket: unknown,
  secret: string,
  now = Date.now(),
  options: { forConnect?: boolean } = {},
): VoiceTicketClaims | null {
  if (!secret || typeof ticket !== 'string' || ticket.length > 2048) return null;
  const parts = ticket.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) return null;
  const expected = createHmac('sha256', secret).update(`v1.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let claims: Partial<VoiceTicketClaims>;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Partial<VoiceTicketClaims>;
  } catch {
    return null;
  }
  if (
    claims?.v !== 1 ||
    !UUID.test(String(claims.sid)) ||
    !UUID.test(String(claims.shop)) ||
    !UUID.test(String(claims.act)) ||
    typeof claims.cexp !== 'number' ||
    typeof claims.sexp !== 'number'
  ) {
    return null;
  }
  if (claims.sexp <= now) return null;
  if (options.forConnect && claims.cexp <= now) return null;
  return claims as VoiceTicketClaims;
}
