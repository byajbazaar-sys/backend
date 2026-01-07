import { Expose, Transform, Type } from 'class-transformer';
import { EDueType } from '../enums';

export class Due {
  @Expose()
  public type: EDueType;

  @Expose()
  @Type(() => Date)
  public dueDate: Date;

  @Expose()
  @Transform(({ obj }) => obj?.loanId?.toString())
  public loanId: string;

  @Expose()
  public dueAmount: number;
}
