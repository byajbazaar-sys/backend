import { Expose, Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';

export class Job {
  @Expose()
  @Transform(({ obj }) => obj._id?.toString())
  public id?: string;

  @Expose()
  public _id?: Types.ObjectId;

  @Expose()
  public name: string;

  @Expose()
  public type: string;

  @Expose()
  public expiresAt?: number;

  @Expose()
  public text?: string;

  @Expose()
  @Transform(({ obj }) => obj?.createdBy?.toString())
  public createdBy?: string;

  @Expose()
  public custom?: Record<string, any>;

  @Expose()
  @Type(() => Date)
  public createdAt?: Date;

  @Expose()
  @Type(() => Date)
  public updatedAt?: Date;

  
  @Expose()
  public numberOfOpenings: number;

  @Expose()
  public status: string;
}
