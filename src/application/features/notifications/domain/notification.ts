import { Expose, Type } from 'class-transformer';

export class Notification {
  @Expose()
  public id?: string;

  @Expose()
  public channel: string;

  @Expose()
  public recipient: string;

  @Expose()
  public subject?: string;

  @Expose()
  public body: string;

  @Expose()
  public status: string;

  @Expose()
  public externalId?: string;

  @Expose()
  public metadata?: Record<string, unknown>;

  @Expose()
  public errorMessage?: string;

  @Expose()
  public createdBy?: string;

  @Expose()
  @Type(() => Date)
  public createdAt?: Date;

  @Expose()
  @Type(() => Date)
  public updatedAt?: Date;
}
