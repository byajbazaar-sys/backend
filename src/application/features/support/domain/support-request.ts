import { Expose, Type } from 'class-transformer';

export class SupportRequest {
  @Expose()
  public id: string;

  @Expose()
  public name: string;

  @Expose()
  public email: string;

  @Expose()
  public mobile: string;

  @Expose()
  public message: string;

  @Expose()
  @Type(() => Date)
  public createdAt?: Date;
}
