export const SMS_OTP_SENDER = 'ISmsOtpSender';

/**
 * Delivers a one-time code by SMS. The provider only sends the message: the code is generated
 * and checked by our own OTP challenge service.
 */
export interface ISmsOtpSender {
  /** @param phoneE164 Indian mobile in E.164 form, e.g. +919876543210 */
  sendOtp(phoneE164: string, code: string, expiryMinutes: number): Promise<void>;
  isConfigured(): boolean;
}
