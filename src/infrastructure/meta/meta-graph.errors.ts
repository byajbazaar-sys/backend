import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AxiosError } from 'axios';

interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export function mapMetaGraphError(err: unknown, fallbackMessage = 'Meta Graph API request failed'): never {
  if (err instanceof HttpException) {
    throw err;
  }

  if (err instanceof AxiosError) {
    const status = err.response?.status;
    const body = err.response?.data as MetaErrorBody | undefined;
    const message = body?.error?.message || err.message || fallbackMessage;
    const code = body?.error?.code;

    if (status === 401 || code === 190) {
      throw new UnauthorizedException('Invalid Meta access token');
    }
    if (status === 403 || code === 10 || code === 200) {
      throw new ForbiddenException(message);
    }
    if (status === 400 || status === 422) {
      throw new BadRequestException(message);
    }
    if (status === 429) {
      throw new ServiceUnavailableException('Meta API rate limit exceeded');
    }
    if (status != null && status >= 500) {
      throw new BadGatewayException('Meta Graph API is temporarily unavailable');
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      throw new ServiceUnavailableException('Meta Graph API request timed out');
    }
    throw new BadGatewayException(message);
  }

  throw new InternalServerErrorException(fallbackMessage);
}

export function assertMetaGraphSuccess<T extends { error?: MetaErrorBody['error'] }>(
  status: number,
  body: T | undefined,
  fallbackMessage: string,
): T {
  if (status >= 200 && status < 300 && body && !body.error) {
    return body;
  }

  const message = body?.error?.message || fallbackMessage;
  const code = body?.error?.code;

  if (status === 401 || code === 190) {
    throw new UnauthorizedException('Invalid Meta access token');
  }
  if (status === 403 || code === 10 || code === 200) {
    throw new ForbiddenException(message);
  }
  if (status === 400 || status === 422) {
    throw new BadRequestException(message);
  }
  if (status === 429) {
    throw new ServiceUnavailableException('Meta API rate limit exceeded');
  }
  if (status >= 500) {
    throw new BadGatewayException('Meta Graph API is temporarily unavailable');
  }

  throw new BadGatewayException(message);
}
