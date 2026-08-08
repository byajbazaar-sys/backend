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
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  isFirstLogin?: boolean;
  googleId?: string;
  isGoogleUser?: boolean;
  profilePhotoRef?: string;
  profilePhoto?: Buffer;
  profilePhotoFileName?: string;
  profilePhotoContentType?: string;
  createdAt?: Date;
  updatedAt?: Date;
  trialEndsAt?: Date;
}
