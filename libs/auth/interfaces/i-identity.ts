import { EUserType } from './e-user.type';

export interface IIdentity {
  userId: string;
  userType: EUserType;
  email?: string;
  emailVerified?: boolean;
}
