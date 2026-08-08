import { Expose } from 'class-transformer';

export class ApiAccessToken {
  @Expose()
  id?: string;

  @Expose()
  apiConfigurationId: string;

  @Expose()
  accessTokenHash: string;

  @Expose()
  expiresAt: Date;

  @Expose()
  lastUsedAt?: Date;

  @Expose()
  createdAt?: Date;

  @Expose()
  revokedAt?: Date;

  @Expose()
  deviceName?: string;

  @Expose()
  clientName?: string;
}
