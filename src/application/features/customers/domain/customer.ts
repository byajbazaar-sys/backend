import { Expose, Type } from 'class-transformer';

export class Customer {
  @Expose()
  public id: string;

  @Expose()
  public createdBy: string;

  @Expose()
  public firstName: string;

  @Expose()
  public middleName?: string;

  @Expose()
  public lastName: string;

  @Expose()
  public email: string;

  @Expose()
  public phone?: string;

  @Expose()
  public alternativePhone?: string;

  @Expose()
  public profilePhoto?: Express.Multer.File;

  @Expose()
  public aadharCard?: Express.Multer.File;

  @Expose()
  public panCard?: Express.Multer.File;

  /** Request-only: remove stored Aadhaar document (not a DB column). */
  @Expose()
  public removeAadharCard?: boolean;

  /** Request-only: remove stored PAN document (not a DB column). */
  @Expose()
  public removePanCard?: boolean;

  @Expose()
  public profilePhotoRef?: string;

  @Expose()
  public aadhaarCardRef?: string;

  @Expose()
  public panCardRef?: string;

  @Expose()
  public location?: string;

  @Expose()
  @Type(() => Date)
  public createdAt?: Date;

  @Expose()
  @Type(() => Date)
  public updatedAt?: Date;
}
