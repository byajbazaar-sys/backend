import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Try-on request was rejected by the AI provider',
  401: 'Try-on AI provider authentication failed',
  403: 'Try-on AI provider access denied',
  404: 'Try-on AI endpoint not found',
  408: 'Try-on AI provider request timed out',
  413: 'Try-on images exceed the provider size limit',
  415: 'Try-on image type is not supported by the provider',
  422: 'Try-on request failed provider validation',
  429: 'Try-on AI provider rate limit exceeded — please retry shortly',
  500: 'Try-on AI provider internal error',
  502: 'Try-on AI provider bad gateway',
  503: 'Try-on AI provider temporarily unavailable',
  504: 'Try-on AI provider gateway timeout',
};

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export function isTransientTryOnStatus(status?: number): boolean {
  return status != null && TRANSIENT_STATUSES.has(status);
}

/**
 * Maps third-party HTTP status codes to Nest application exceptions.
 * Never includes raw Axios error objects or response bodies with image data.
 */
export function mapAivotHttpError(status: number, message?: string): HttpException {
  const detail = message?.trim() || STATUS_MESSAGES[status ?? 0] || 'Try-on AI provider request failed';

  switch (status) {
    case 400:
      return new BadRequestException(detail);
    case 401:
      return new UnauthorizedException(detail);
    case 403:
      return new ForbiddenException(detail);
    case 404:
      return new NotFoundException(detail);
    case 408:
      return new RequestTimeoutException(detail);
    case 413:
      return new PayloadTooLargeException(detail);
    case 415:
      return new HttpException(detail, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    case 422:
      return new UnprocessableEntityException(detail);
    case 429:
      return new HttpException(detail, HttpStatus.TOO_MANY_REQUESTS);
    case 500:
      return new HttpException(detail, HttpStatus.INTERNAL_SERVER_ERROR);
    case 502:
      return new BadGatewayException(detail);
    case 503:
      return new ServiceUnavailableException(detail);
    case 504:
      return new GatewayTimeoutException(detail);
    default:
      return new BadGatewayException(detail);
  }
}
