import { Request } from 'express';
import { IIdentity } from '../interfaces';

export const AUTHENTICATION_PROVIDERS = 'AUTHENTICATION_PROVIDERS';

export interface IAuthenticationProvider {
  /** Returns authenticated principal or null when this provider does not apply. */
  authenticate(request: Request): Promise<IIdentity>;
}
