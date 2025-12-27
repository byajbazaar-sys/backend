import { User } from '../../users';
import { IIdentity } from '@shared-libs';
import { LoginResponseModel } from '../models';

export const AUTH_SERVICE = 'IAuthService';

export interface IAuthService {
  login(email: string, password: string): Promise<LoginResponseModel>;
  signup(body: User): Promise<User>;
  generateJwtToken(payload: IIdentity): Promise<string>;
  forgotPassword(email: string): Promise<void>;
  verifyForgotPasswordToken(token: string, newPassword: string): Promise<User>;
}
