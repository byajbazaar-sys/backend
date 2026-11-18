import { IIdentity } from '@shared-libs';

import { User } from '../../users';
import { LoginResponseModel, GoogleSsoResponseModel, GoogleSsoRequestModel } from '../models';
import { SignupOtpInput } from './signup-otp-input';

export const AUTH_SERVICE = 'IAuthService';

export interface IAuthService {
  login(email: string, password: string): Promise<LoginResponseModel>;
  signup(body: User, codes: SignupOtpInput): Promise<LoginResponseModel>;
  generateJwtToken(payload: IIdentity): Promise<string>;
  forgotPassword(email: string): Promise<void>;
  verifyForgotPasswordToken(token: string, newPassword: string): Promise<User>;
  googleSso(request: GoogleSsoRequestModel): Promise<GoogleSsoResponseModel>;
}
