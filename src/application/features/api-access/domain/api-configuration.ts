import { Expose } from 'class-transformer';

export class ApiConfiguration {
  @Expose()
  id?: string;

  @Expose()
  userId: string;

  @Expose()
  apiKey: string;

  @Expose()
  apiSecretHash: string;

  @Expose()
  isActive: boolean;

  @Expose()
  lastUsedAt?: Date;

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;
}
