export const REDIS_SERVICE = 'IRedisService';

export interface IRedisService {
  setAsync<T>(key: string, value: T, expiration?: number, prefix?: string): Promise<T>;
  getAsync<T>(key: string): Promise<T | null>;
  /** Atomically read-and-delete. Returns null when missing or Redis is down. */
  takeAsync<T>(key: string): Promise<T | null>;
  deleteAsync(key: string): Promise<boolean>;
  getKeyExpirationTimeAsync(key: string): Promise<number>;
  pingAsync(): Promise<string>;
  isEnabled(): boolean;
}
