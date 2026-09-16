import jwt from 'jsonwebtoken';

import { config } from './config';

export type AuthUser = { userId: string };

export function verifyByajbazaarToken(token: string | undefined): AuthUser {
  if (!token?.trim()) {
    throw new Error('Unauthorized: missing token');
  }

  try {
    const payload = jwt.verify(token.trim(), config.jwt.secret, {
      audience: config.jwt.audience,
      issuer: config.jwt.issuer,
      algorithms: [config.jwt.algorithm],
    }) as jwt.JwtPayload;

    const userId = payload.userId ?? payload.sub;
    if (!userId) {
      throw new Error('Unauthorized: invalid token payload');
    }

    return { userId: String(userId) };
  } catch {
    throw new Error('Unauthorized: invalid or expired token');
  }
}

export function extractTokenFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.searchParams.get('token') ?? undefined;
  } catch {
    return undefined;
  }
}
