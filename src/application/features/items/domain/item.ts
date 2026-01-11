import { Expose, Transform } from 'class-transformer';
import { Types } from 'mongoose';

export class Item {
  @Expose()
  public _id?: Types.ObjectId;

  @Expose()
  @Transform(({ obj }) => obj?._id?.toString())
  public id?: string;

  @Expose()
  public name: string;

  @Expose()
  public description?: string;

  @Expose()
  @Transform(({ obj }) => obj?.createdBy?.toString())
  public createdBy?: string;

  @Expose()
  public createdAt?: Date;

  @Expose()
  public updatedAt?: Date;
}
