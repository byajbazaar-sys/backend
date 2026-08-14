import { Request } from 'express';

import { IIdentity } from '../interfaces';

export const AUTHENTICATION_ORCHESTRATOR = 'AUTHENTICATION_ORCHESTRATOR';

export interface IAuthenticationOrchestrator {
  authenticate(request: Request): Promise<IIdentity>;
}
