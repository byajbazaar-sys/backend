import { Environment } from '@shared-libs';
import { IncomingMessage, ServerResponse } from 'http';
import { LevelWithSilent } from 'pino';
import { DestinationStream } from 'pino';
import { Options as PinoHttpOptions } from 'pino-http';

type RequestWithStart = IncomingMessage & { _startTimeNs?: bigint; method: string; url: string };

type PinoHttpParam<Req, Res> = PinoHttpOptions<Req, Res> | [PinoHttpOptions<Req, Res>, DestinationStream];

/**
 * Returns the pino-http options used by nestjs-pino's LoggerModule.
 * Pretty transport is enabled for non-production environments.
 */
export const createPinoHttpOptions = (env: Environment): PinoHttpParam<RequestWithStart, ServerResponse> => {
  const isProduction = env === 'production';

  const getDurationMs = (req: RequestWithStart): number | undefined => {
    const start = req._startTimeNs;
    if (typeof start === 'bigint') {
      const diffNs = process.hrtime.bigint() - start;
      return Number(diffNs / BigInt(1_000_000));
    }
    return undefined;
  };

  const baseOptions: PinoHttpOptions<RequestWithStart, ServerResponse> = {
    autoLogging: true,
    customReceivedMessage: (req: RequestWithStart): string => {
      req._startTimeNs = process.hrtime.bigint();
      return `→ ${req.method} ${req.url}`;
    },
    customLogLevel: (_req: RequestWithStart, res: ServerResponse, err: Error | undefined): LevelWithSilent => {
      if (err !== undefined || (res !== undefined && res.statusCode >= 400)) return 'silent';
      return 'info';
    },
    customSuccessMessage: (req: RequestWithStart, res: ServerResponse): string => {
      const ms = getDurationMs(req);
      return `← ${req.method} ${req.url} statusCode ${res.statusCode} in ${ms ?? 'N/A'}ms`;
    },
    customErrorMessage: (req: RequestWithStart, res: ServerResponse, err: Error): string => {
      const ms = getDurationMs(req);
      return `× ${req.method} ${req.url} statusCode ${res.statusCode} in ${ms ?? 'N/A'}ms - ${err.message}`;
    },
    customProps: (req: RequestWithStart): { context: string; responseTimeMs: number | undefined } => ({
      context: 'HTTP',
      responseTimeMs: getDurationMs(req),
    }),
  };

  if (isProduction) {
    return baseOptions;
  }

  const pretty = require('pino-pretty')({
    colorize: true,
    singleLine: false,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
  }) as DestinationStream;

  return [baseOptions, pretty];
};
