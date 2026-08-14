import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { IIdentity } from '../interfaces';
import {
  AUTHENTICATION_ORCHESTRATOR,
  IAuthenticationOrchestrator,
  ISubscriptionAccessChecker,
  SUBSCRIPTION_ACCESS_CHECKER,
} from '../providers';

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTHENTICATION_ORCHESTRATOR)
    private readonly authenticationOrchestrator: IAuthenticationOrchestrator,
    @Inject(SUBSCRIPTION_ACCESS_CHECKER)
    private readonly subscriptionAccessChecker: ISubscriptionAccessChecker,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    request.user = await this.authenticationOrchestrator.authenticate(request);
    if (request.user) {
      await this.subscriptionAccessChecker.assertAccess(request.user as IIdentity, context);
    }
    return true;
  }
}
