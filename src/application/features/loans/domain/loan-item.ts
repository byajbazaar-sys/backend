import { Expose, Type } from 'class-transformer';

export class LoanItem {
  @Expose()
  public id: string;

  @Expose()
  public loanId: string;

  @Expose()
  public itemId: string;

  @Expose()
  @Type(() => Number)
  public amount: number;

  @Expose()
  public itemName?: string;

  @Expose()
  public itemDescription?: string;

  @Expose()
  @Type(() => Number)
  public netWeightInGrams: number;

  @Expose()
  @Type(() => Number)
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
  @Type(() => Number)
  public currentRate?: number;

  @Expose()
  public createdBy?: string;
}
