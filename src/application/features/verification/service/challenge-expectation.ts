import { OtpChannel } from './otp-channel';
import { OtpPurpose } from './otp-purpose';

export interface ChallengeExpectation {
  channel: OtpChannel;
  target: string;
  purpose: OtpPurpose;
  userId?: string;
}
