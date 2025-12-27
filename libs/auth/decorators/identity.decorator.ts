import { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';

import { IIdentity } from '../interfaces';

export const Identity = createParamDecorator((data: unknown, ctx: ExecutionContext): IIdentity => {
  const request = ctx.switchToHttp().getRequest<{ user?: IIdentity }>();
  const user = request?.user;

  if (!user) {
    throw new Error('User not found in request. Make sure AuthGuard is applied before using @Identity()');
  }

  return user;
});
