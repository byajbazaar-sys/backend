import { EUserType } from '@shared-libs';

/** Fields required to create a user row (signup, Google OAuth). */
export interface CreateUserInput {
  id?: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  userType?: EUserType;
  isEmailVerified?: boolean;
  emailVerifiedAt?: Date;
  isPhoneVerified?: boolean;
  phoneVerifiedAt?: Date;
  phoneVerificationRequired?: boolean;
  isFirstLogin?: boolean;
  lastLoginAt?: Date;
  googleId?: string;
  isGoogleUser?: boolean;
  profilePhotoRef?: string;
  profilePhoto?: Buffer;
  profilePhotoFileName?: string;
  profilePhotoContentType?: string;
  businessName?: string;
  address?: string;
  state?: string;
  /** Extra shop accounts: the owner's account id. */
  ownerUserId?: string | null;
  catalogSlug?: string;
  catalogEnabled?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  trialEndsAt?: Date;
}
