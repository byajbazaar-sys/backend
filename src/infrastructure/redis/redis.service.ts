import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { BaseRedisService } from './base-redis.service';
import { RedisOptions } from './options';
import { IMsConfig } from '../../configurations';

const DISABLED_REDIS_OPTIONS = new RedisOptions('redis://disabled', 0, 0);

@Injectable()
export class RedisService extends BaseRedisService {
  constructor(config: ConfigService<IMsConfig>, @InjectPinoLogger(RedisService.name) logger: PinoLogger) {
    const options = config.get<RedisOptions>('redis');
    super(options ?? DISABLED_REDIS_OPTIONS, logger, !!options?.url);
  }
}
