import { Expose } from 'class-transformer';

export class Item {
  @Expose()
  public id?: string;

  @Expose()
  public name: string;

  @Expose()
  public description?: string;

  @Expose()
  public createdBy?: string;

  @Expose()
  public createdAt?: Date;

  @Expose()
  public updatedAt?: Date;
}
