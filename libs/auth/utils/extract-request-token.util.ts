import { Request } from 'express';

export function readRequestHeader(request: Request, headerName: string): string | undefined {
  const value = request.headers[headerName.toLowerCase()];
  if (value == null) return undefined;
  const raw = Array.isArray(value) ? value[0] : String(value).split(',')[0];
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

export function extractRequestToken(request: Request, queryParamName: string): string | undefined {
  const authorization = request.headers.authorization;
  if (typeof authorization === 'string') {
    if (authorization.startsWith('Bearer ')) {
      const bearer = authorization.slice(7).trim();
      if (bearer) return bearer;
    } else if (authorization.trim()) {
      return authorization.trim();
    }
  }

  const queryToken = request.query[queryParamName];
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }

  return undefined;
}
