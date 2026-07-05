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
  lastUsedAt?: Date | null;

  @Expose()
  createdAt?: Date;

  @Expose()
  revokedAt?: Date | null;

  @Expose()
  deviceName?: string | null;

  @Expose()
  clientName?: string | null;
}
