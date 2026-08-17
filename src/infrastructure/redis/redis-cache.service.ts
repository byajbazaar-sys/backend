import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { cacheDataKey, cacheVersionKey } from '../../application/shared/cache/cache.constants';
import { ICacheService } from '../../application/shared/services/i-cache.service';
import { IRedisService, REDIS_SERVICE } from '../../application/shared/services/i-redis.service';

const CACHE_VERSION_TTL_SECONDS = 86_400;

@Injectable()
export class RedisCacheService implements ICacheService {
  constructor(
    @Inject(REDIS_SERVICE) private readonly redis: IRedisService,
    @InjectPinoLogger(RedisCacheService.name) private readonly logger: PinoLogger,
  ) {}

  async getOrLoad<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    try {
      const cached = await this.redis.getAsync<T>(key);
      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      this.logger.warn({ key, error }, 'Cache read failed — loading from source');
    }

    const value = await loader();

    try {
      await this.redis.setAsync(key, value, ttlSeconds);
    } catch (error) {
      this.logger.warn({ key, error }, 'Cache write failed — returning fresh value');
    }

    return value;
  }

  async getOrLoadVersioned<T>(
    namespace: string,
    userId: string,
    keyParts: string[],
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const version = await this.getUserCacheVersion(namespace, userId);
    const key = cacheDataKey(namespace, userId, version, keyParts);
    return this.getOrLoad(key, ttlSeconds, loader);
  }

  async invalidate(key: string): Promise<void> {
    try {
      await this.redis.deleteAsync(key);
    } catch (error) {
      this.logger.warn({ key, error }, 'Cache invalidation failed');
    }
  }

  async bumpUserCache(namespace: string, userId: string): Promise<void> {
    try {
      await this.redis.setAsync(cacheVersionKey(namespace, userId), String(Date.now()), CACHE_VERSION_TTL_SECONDS);
    } catch (error) {
      this.logger.warn({ namespace, userId, error }, 'Cache version bump failed');
    }
  }

  private async getUserCacheVersion(namespace: string, userId: string): Promise<string> {
    try {
      const version = await this.redis.getAsync<string>(cacheVersionKey(namespace, userId));
      return version ?? '0';
    } catch (error) {
      this.logger.warn({ namespace, userId, error }, 'Cache version read failed');
      return '0';
    }
  }
}
