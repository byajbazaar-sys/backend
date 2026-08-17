import { IRedisOptions } from './i-redis-options';

export class RedisOptions implements IRedisOptions {
  public url: string;
  public maxReconnectionAttempts: number;
  public reconnectionDelayInMilliseconds: number;

  constructor(url: string, maxReconnectionAttempts: number, reconnectionDelayInMilliseconds: number) {
    this.url = url;
    this.maxReconnectionAttempts = maxReconnectionAttempts;
    this.reconnectionDelayInMilliseconds = reconnectionDelayInMilliseconds;
  }
}
