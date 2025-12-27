import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { isProd } from '@shared-libs';

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  error?: string;
  errors?: unknown;
  details?: string;
}

@Injectable()
export class GlobalResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  private readonly logger = new Logger(GlobalResponseInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const response = context.switchToHttp().getResponse();
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      map((data) => {
        const res = this.handleSuccess(data, context);

        this.logger.log(`[${request.method}] ${request.url} → ${res.statusCode} ${res.message}`);

        return res;
      }),
      catchError((error) => {
        this.handleError(error, context);
        return new Observable<never>(); // stop stream propagation
      }),
    );
  }

  private handleSuccess(data: any, context: ExecutionContext): ApiResponse<any> {
    const res = context.switchToHttp().getResponse();
    const statusCode = res.statusCode || HttpStatus.OK;

    if (data && typeof data === 'object' && 'statusCode' in data) {
      return data;
    }

    return {
      statusCode,
      message: 'Success',
      data: data ?? null,
    };
  }

  private handleError(error: any, context: ExecutionContext): void {
    const response = context.switchToHttp().getResponse();
    const request = context.switchToHttp().getRequest();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorName = 'Internal Server Error';
    let errors: unknown = undefined;
    let details: string | undefined;

    if (error instanceof HttpException) {
      statusCode = error.getStatus();
      const errorResponse = error.getResponse();

      if (typeof errorResponse === 'object' && errorResponse !== null) {
        const errObj = errorResponse as Record<string, any>;
        message = errObj.message || error.message;
        errorName = errObj.error || error.name;
        errors = errObj.errors;
      } else if (typeof errorResponse === 'string') {
        message = errorResponse;
        errorName = error.name || 'HttpException';
      }
    } else if (error instanceof Error) {
      message = error.message;
      errorName = error.name;
    }

    details = error?.stack || error?.message;

    const errorBody: ApiResponse<{}> = {
      statusCode,
      message,
      error: errorName,
      data: {},
      ...(errors && { errors }),
    };

    // 🪵 Log error details
    this.logger.error(`[${request.method}] ${request.url} → ${statusCode} ${message}`, details);

    // ✅ Send JSON response
    response.status(statusCode).json(errorBody);
  }
}
