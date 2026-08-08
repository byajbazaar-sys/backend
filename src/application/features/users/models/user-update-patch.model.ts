import { EUserType } from '@shared-libs';
import { Expose, Type } from 'class-transformer';

/** Persistable user fields for repository updates (profile, auth, billing). */
export class UserUpdatePatch {
  @Expose()
  firstName?: string;

  @Expose()
  lastName?: string;

  @Expose()
  phoneNumber?: string;

  @Expose()
  password?: string;

  @Expose()
  userType?: EUserType;

  @Expose()
  isEmailVerified?: boolean;

  @Expose()
  @Type(() => Date)
  emailVerifiedAt?: Date;

  @Expose()
  resetPasswordToken?: string | null;

  @Expose()
  @Type(() => Date)
  resetPasswordExpires?: Date | null;

  @Expose()
  emailVerificationToken?: string | null;

  @Expose()
  @Type(() => Date)
  emailVerificationExpires?: Date | null;

  @Expose()
  profilePhotoRef?: string;

  @Expose()
  shopLogoRef?: string;

  @Expose()
  businessName?: string;

  @Expose()
  address?: string;

  @Expose()
  gstin?: string;

  @Expose()
  pan?: string;

  @Expose()
  state?: string;

  @Expose()
  stateCode?: string;

  @Expose()
  proprietorName?: string;

  @Expose()
  alternatePhoneNumber?: string;

  @Expose()
  bankName?: string;

  @Expose()
  bankBranch?: string;

  @Expose()
  bankAccountNumber?: string;

  @Expose()
  bankIfsc?: string;

  @Expose()
  showBankDetailsOnBill?: boolean;

  @Expose()
  tryOnBackgroundColor?: string;

  @Expose()
  googleId?: string;

  @Expose()
  isGoogleUser?: boolean;

  @Expose()
  @Type(() => Date)
  lastLoginAt?: Date;

  @Expose()
  isFirstLogin?: boolean;

  @Expose()
  @Type(() => Date)
  trialEndsAt?: Date | null;
}
