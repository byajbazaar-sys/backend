import { IIdentity } from '@shared-libs';

import { User } from '../../users';
import { LoginResponseModel, GoogleSsoResponseModel, GoogleSsoRequestModel } from '../models';

export const AUTH_SERVICE = 'IAuthService';

/** Codes from the sign-up verification page (challenge tokens come from POST /auth/otp/send). */
export interface SignupOtpInput {
  emailChallenge: string;
  emailCode: string;
  phoneChallenge: string;
  phoneCode: string;
}

export interface IAuthService {
  login(email: string, password: string): Promise<LoginResponseModel>;
  signup(body: User, codes: SignupOtpInput): Promise<LoginResponseModel>;
  generateJwtToken(payload: IIdentity): Promise<string>;
  forgotPassword(email: string): Promise<void>;
  verifyForgotPasswordToken(token: string, newPassword: string): Promise<User>;
  googleSso(request: GoogleSsoRequestModel): Promise<GoogleSsoResponseModel>;
}
