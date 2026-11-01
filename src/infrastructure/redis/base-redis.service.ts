import { OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { createClient, RedisClientType } from 'redis';

import { IRedisOptions } from './options';
import { IRedisService } from '../../application';

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function fromJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function isNilOrEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export abstract class BaseRedisService implements OnApplicationBootstrap, IRedisService {
  private connected = false;
  private ready = false;
  private reconnecting = false;
  private reconnectionAttempts = 0;
  private redisClient!: RedisClientType;
  private readonly enabled: boolean;

  protected constructor(
    protected readonly options: IRedisOptions,
    protected readonly logger: PinoLogger,
    enabled = true,
  ) {
    this.enabled = enabled && !!options.url;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.logger.info('Redis disabled — REDIS_URL not configured');
      return;
    }

    this.logger.info('Connecting to Redis');
    this.createClient();
    this.addListeners();
    await this.startConnectionAsync();
  }

  public async pingAsync(): Promise<string> {
    if (!this.enabled) {
      return 'DISABLED';
    }

    return this.redisClient.ping();
  }

  public async setAsync<T>(key: string, value: T, expiration?: number, prefix?: string): Promise<T> {
    if (!this.enabled) {
      return value;
    }

    try {
      const resolvedKey = !isNilOrEmpty(prefix) ? `${prefix}:${key}` : key;
      await this.redisClient.set(resolvedKey, toJson(value), expiration ? { EX: expiration } : undefined);
      const result = await this.redisClient.get(resolvedKey);
      return fromJson<T>(result);
    } catch (ex) {
      this.logger.warn({ key, error: ex }, 'Redis set failed — continuing without cache');
      return value;
    }
  }

  public async getAsync<T>(key: string): Promise<T> {
    if (!this.enabled) {
      return null;
    }

    try {
      const value = await this.redisClient.get(key);
      return !isNilOrEmpty(value) ? fromJson<T>(value) : null;
    } catch (ex) {
      this.logger.warn({ key, error: ex }, 'Redis get failed — treating as cache miss');
      return null;
    }
  }

  public async takeAsync<T>(key: string): Promise<T> {
    if (!this.enabled) {
      return null;
    }

    try {
      const value = await this.redisClient.getDel(key);
      return !isNilOrEmpty(value) ? fromJson<T>(value) : null;
    } catch (ex) {
      this.logger.warn({ key, error: ex }, 'Redis take failed — treating as miss');
      return null;
    }
  }

  public async consumeRateLimitAsync(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number; count: number }> {
    if (!this.enabled || !this.connected || !this.ready) {
      throw new Error('Redis is required for authentication rate limiting');
    }

    try {
      const result = await this.redisClient.eval(
        'local count = redis.call("INCR", KEYS[1]); if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]); end; local ttl = redis.call("TTL", KEYS[1]); return {count, ttl};',
        { keys: [key], arguments: [String(windowSeconds)] },
      );
      if (!Array.isArray(result) || result.length !== 2) {
        throw new Error('Redis returned an invalid rate-limit result');
      }

      const count = Number(result[0]);
      const retryAfterSeconds = Math.max(1, Number(result[1]));
      if (!Number.isSafeInteger(count) || !Number.isFinite(retryAfterSeconds)) {
        throw new Error('Redis returned an invalid rate-limit result');
      }

      return { allowed: count <= limit, retryAfterSeconds, count };
    } catch (error) {
      this.logger.error({ key, error }, 'Redis rate-limit operation failed');
      throw new Error('Authentication rate limiting is temporarily unavailable');
    }
  }

  public async deleteAsync(key: string): Promise<boolean> {
    if (!this.enabled) {
      return true;
    }

    try {
      await this.redisClient.del(key);
      return true;
    } catch (ex) {
      this.logger.warn({ key, error: ex }, 'Redis delete failed — continuing without cache eviction');
      return false;
    }
  }

  public async getKeyExpirationTimeAsync(key: string): Promise<number> {
    if (!this.enabled) {
      return -2;
    }

    try {
      return await this.redisClient.ttl(key);
    } catch (ex) {
      this.logger.warn({ key, error: ex }, 'Redis TTL lookup failed');
      return -2;
    }
  }

  private createClient(): void {
    this.redisClient = createClient({
      url: this.options.url,
      socket: {
        connectTimeout: this.options.reconnectionDelayInMilliseconds,
        reconnectStrategy: false,
      },
    });
  }

  private addListeners(): void {
    this.redisClient.on('error', (error) => {
      this.logger.error(error, 'Redis error');
      this.connected = false;
      this.ready = false;
      this.startReconnectionStrategy();
    });
    this.redisClient.on('ready', () => {
      this.logger.info('Redis ready');
      this.ready = true;
    });
    this.redisClient.on('connect', () => {
      this.logger.info('Redis connected');
      this.connected = true;
    });
    this.redisClient.on('disconnect', () => {
      this.logger.warn('Redis disconnected');
      this.connected = false;
    });
  }

  private async startConnectionAsync(): Promise<void> {
    try {
      await this.redisClient.connect();
    } catch (ex) {
      this.logger.warn('Failed to connect to Redis');
      this.startReconnectionStrategy();
    }
  }

  private startReconnectionStrategy(): void {
    if (this.reconnecting) {
      return;
    }

    if (this.connected) {
      void this.redisClient.disconnect();
    }

    this.reconnecting = true;
    setTimeout(() => {
      this.logger.info('Attempting to reconnect to Redis');
      this.redisClient
        .connect()
        .then(() => {
          this.reconnecting = false;
          this.reconnectionAttempts = 0;
        })
        .catch((ex) => {
          this.reconnecting = false;
          this.reconnectionAttempts += 1;
          this.logger.error(ex);

          if (this.reconnectionAttempts > this.options.maxReconnectionAttempts) {
            this.logger.error('Reconnection attempts failed. Stopping reconnection strategy.');
            return;
          }

          this.startReconnectionStrategy();
        });
    }, this.options.reconnectionDelayInMilliseconds);
  }
}
