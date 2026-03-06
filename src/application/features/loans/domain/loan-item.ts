import { Expose } from 'class-transformer';

export class LoanItem {
  @Expose()
  public id: string;

  @Expose()
  public loanId: string;

  @Expose()
  public itemId: string;

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

  @Expose()
  public createdBy?: string;
}
