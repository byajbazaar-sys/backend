import { ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { EUserType, IIdentity, ISubscriptionAccessChecker } from '@shared-libs';

import { isPremiumApiPath } from '../constants';
import { IPaymentsService, PAYMENTS_SERVICE } from '../service/i-payments.service';

@Injectable()
export class SubscriptionAccessChecker implements ISubscriptionAccessChecker {
  constructor(@Inject(PAYMENTS_SERVICE) private readonly paymentsService: IPaymentsService) {}

  async assertAccess(identity: IIdentity, context: ExecutionContext): Promise<void> {
    if (!identity?.userId || identity.userType === EUserType.Admin) {
      return;
    }

    const req = context.switchToHttp().getRequest<{ path?: string; url?: string }>();
    const path = (req.path || req.url || '').split('?')[0];

    if (!isPremiumApiPath(path)) {
      return;
    }

    const hasPremiumAccess = await this.paymentsService.hasAppAccess(identity.userId);
    if (!hasPremiumAccess) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Subscription required for inventory and billing features.',
        error: 'SubscriptionRequired',
      });
    }
  }
}
