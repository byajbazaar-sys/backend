import { ExecutionContext } from '@nestjs/common';
import { IIdentity } from '../interfaces';

export const SUBSCRIPTION_ACCESS_CHECKER = 'SUBSCRIPTION_ACCESS_CHECKER';

export interface ISubscriptionAccessChecker {
  assertAccess(identity: IIdentity, context: ExecutionContext): Promise<void>;
}
