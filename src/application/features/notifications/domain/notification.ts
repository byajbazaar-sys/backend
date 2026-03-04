import { Expose, Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';

export class Notification {
  @Expose()
  @Transform(({ obj }) => obj?._id)
  public _id?: Types.ObjectId;

  @Expose()
  @Transform(({ obj }) => obj?._id?.toString())
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
  @Transform(({ obj }) => obj?.createdBy?.toString())
  public createdBy?: string;

  @Expose()
  @Type(() => Date)
  public createdAt?: Date;

  @Expose()
  @Type(() => Date)
  public updatedAt?: Date;
}
