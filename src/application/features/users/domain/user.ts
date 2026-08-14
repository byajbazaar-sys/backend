import { EUserType } from '@shared-libs';
import { Expose, Type } from 'class-transformer';

export class User {
  @Expose()
  public id?: string;

  @Expose()
  public firstName?: string;

  @Expose()
  public lastName?: string;

  @Expose()
  public email?: string;

  @Expose()
  public password?: string;

  @Expose()
  public phoneNumber?: string;

  @Expose()
  public userType?: EUserType;

  @Expose()
  public isEmailVerified?: boolean;

  @Expose()
  public emailVerifiedAt?: Date;

  @Expose()
  public passwordChangedAt?: Date;

  @Expose()
  public resetPasswordToken?: string;

  @Expose()
  public resetPasswordExpires?: Date;

  @Expose()
  public emailVerificationToken?: string;

  @Expose()
  public emailVerificationExpires?: Date;

  @Expose()
  public createdAt?: Date;

  @Expose()
  public updatedAt?: Date;

  @Expose()
  public profilePhotoRef?: string;

  @Expose()
  @Type(() => Buffer)
  public profilePhoto: Buffer;

  @Expose()
  public profilePhotoFileName: string;

  @Expose()
  public profilePhotoContentType: string;

  @Expose()
  public businessName?: string;

  @Expose()
  public catalogSlug?: string;

  @Expose()
  public catalogEnabled?: boolean;

  @Expose()
  public address?: string;

  @Expose()
  public gstin?: string;

  @Expose()
  public pan?: string;

  @Expose()
  public state?: string;

  @Expose()
  public stateCode?: string;

  @Expose()
  public proprietorName?: string;

  @Expose()
  public shopLogoRef?: string;

  @Expose()
  @Type(() => Buffer)
  public shopLogo?: Buffer;

  @Expose()
  public shopLogoFileName?: string;

  @Expose()
  public shopLogoContentType?: string;

  @Expose()
  public alternatePhoneNumber?: string;

  @Expose()
  public bankName?: string;

  @Expose()
  public bankBranch?: string;

  @Expose()
  public bankAccountNumber?: string;

  @Expose()
  public bankIfsc?: string;

  @Expose()
  public showBankDetailsOnBill?: boolean;

  @Expose()
  public tryOnBackgroundColor?: string;

  @Expose()
  public googleId?: string;

  @Expose()
  public isGoogleUser?: boolean;

  @Expose()
  @Type(() => Date)
  public lastLoginAt?: Date;

  @Expose()
  public isFirstLogin?: boolean;

  @Expose()
  @Type(() => Date)
  public trialEndsAt?: Date;

  @Expose()
  @Type(() => Date)
  public deletedAt?: Date;
}
