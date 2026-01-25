import { isLocal } from '@shared-libs';
import { Params } from 'nestjs-pino';


const getTransport = (): any => {
  if (!isLocal()) {
    return undefined;
  }
  return {
    target: 'pino-pretty',
    options: {
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname,req.headers',
    },
  };
};

export const generateLoggerConfig = (): Params => {
  const result: Params = {
    pinoHttp: {
      level: 'info',
      transport: getTransport(),
    },
  };

  return result as Params;
};
