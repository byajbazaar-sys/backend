import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../decorators';
import { EUserType, IIdentity } from '../interfaces';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.get<EUserType[]>(ROLES_KEY, context.getHandler());
    if (!requiredRole) return true;

    const req = context.switchToHttp().getRequest<{ user?: IIdentity }>();
    const user = req?.user;

    if (!user || !requiredRole.includes(user.userType)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
