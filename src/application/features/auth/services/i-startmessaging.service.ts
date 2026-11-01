export const STARTMESSAGING_SERVICE = 'STARTMESSAGING_SERVICE';

export interface IStartMessagingService {
  sendOtp(phoneNumber: string, otp: string): Promise<string>;
  verifyOtp(requestId: string, otpCode: string): Promise<boolean>;
}
