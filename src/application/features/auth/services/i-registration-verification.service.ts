import {
  RegistrationEmailSendResult,
  RegistrationEmailVerificationResult,
  RegistrationPhoneOtpSendResult,
  RegistrationPhoneOtpVerifyResult,
} from '../domain/registration-verification';

export const REGISTRATION_VERIFICATION_SERVICE = 'REGISTRATION_VERIFICATION_SERVICE';

export interface IRegistrationVerificationService {
  sendRegistrationEmailVerification(email: string): Promise<RegistrationEmailSendResult>;
  verifyRegistrationEmail(token: string): Promise<RegistrationEmailVerificationResult>;
  sendRegistrationPhoneOtp(phoneNumber: string): Promise<RegistrationPhoneOtpSendResult>;
  verifyRegistrationPhoneOtp(
    challengeToken: string,
    otpCode: string,
  ): Promise<RegistrationPhoneOtpVerifyResult>;
  assertEmailVerification(email: string, token: string): Promise<void>;
  assertPhoneVerification(phoneNumber: string, token: string): Promise<void>;
}
