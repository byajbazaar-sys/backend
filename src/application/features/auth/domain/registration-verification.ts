export const REGISTRATION_EMAIL_VERIFICATION_PURPOSE = 'registration-email-verification';
export const REGISTRATION_PHONE_CHALLENGE_PURPOSE = 'registration-phone-challenge';
export const REGISTRATION_PHONE_VERIFICATION_PURPOSE = 'registration-phone-verification';

export interface RegistrationVerificationClaims {
  sub: string;
  purpose: string;
  phoneNumber?: string;
  requestId?: string;
  exp?: number;
}

export interface RegistrationEmailVerificationResult {
  email: string;
  emailVerificationToken: string;
  expiresAt: number;
}

export interface RegistrationEmailSendResult {
  message: string;
  retryAfterSeconds: number;
}

export interface RegistrationPhoneOtpSendResult {
  challengeToken: string;
  expiresInSeconds: number;
  retryAfterSeconds: number;
}

export interface RegistrationPhoneOtpVerifyResult {
  phoneVerificationToken: string;
  expiresInSeconds: number;
}
