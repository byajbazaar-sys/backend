import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLE_KEY } from '../decorators';
import { EUserType, IIdentity } from '../interfaces';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.getAllAndOverride<EUserType>(ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRole) return true;

    const req = context.switchToHttp().getRequest<{ user?: IIdentity }>();
    const user = req?.user;

    if (!user || user.userType !== requiredRole) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
