/** Codes from the sign-up verification page (challenge tokens come from POST /auth/otp/send). */
export interface SignupOtpInput {
  emailChallenge: string;
  emailCode: string;
  phoneChallenge: string;
  phoneCode: string;
}
