import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import {
  AUTHENTICATION_ORCHESTRATOR,
  IAuthenticationOrchestrator,
} from '../providers';

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTHENTICATION_ORCHESTRATOR)
    private readonly authenticationOrchestrator: IAuthenticationOrchestrator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    try {
      request.user = await this.authenticationOrchestrator.authenticate(request);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
