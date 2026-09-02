import { ExecutionContext, Injectable } from '@nestjs/common';
import { IIdentity, ISubscriptionAccessChecker } from '@shared-libs';

@Injectable()
export class SubscriptionAccessChecker implements ISubscriptionAccessChecker {
  async assertAccess(_identity: IIdentity, _context: ExecutionContext): Promise<void> {
    // All authenticated users have full app access. Subscriptions only remove ads.
  }
}
