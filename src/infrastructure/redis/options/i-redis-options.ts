export interface IRedisOptions {
  /** Full Redis URL (e.g. Upstash rediss://default:token@host:6379). */
  url: string;
  maxReconnectionAttempts: number;
  reconnectionDelayInMilliseconds: number;
}
