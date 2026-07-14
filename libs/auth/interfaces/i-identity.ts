import { EUserType } from './e-user.type';

export type AuthScope = 'full' | 'payment';

export interface IIdentity {
  userId: string;
  userType: EUserType;
  email?: string;
  emailVerified?: boolean;
  /** full = app access; payment = subscription checkout only */
  scope?: AuthScope;
}
