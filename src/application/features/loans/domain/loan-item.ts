import { Expose, Transform } from 'class-transformer';
import { Types } from 'mongoose';
import { ELoanItemType } from '../enums';

export class LoanItem {
  @Expose()
  public _id?: Types.ObjectId;

  @Expose()
  @Transform(({ obj }) => obj?._id?.toString())
  public id: string;

  @Expose()
  @Transform(({ obj }) => obj?.loanId?.toString())
  public loanId: string;

  @Expose()
  public type: ELoanItemType;

  @Expose()
  public amount: number;

  @Expose()
  public itemName: string;

  @Expose()
  public itemDescription?: string;

  @Expose()
  public netWeightInGrams: number;

  @Expose()
  public grossWeightInGrams: number;

  @Expose()
  public image?: Express.Multer.File;

  @Expose()
  public imageRef?: string;

  @Expose()
  public createdAt?: Date;

  @Expose()
  public updatedAt?: Date;

  @Expose()
  public currentRate?: number;
}
