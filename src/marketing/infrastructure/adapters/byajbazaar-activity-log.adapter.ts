import { Inject, Injectable } from '@nestjs/common';

import { ACTIVITY_LOGGER, EActivityLogCategory, IActivityLogger } from '../../../application';
import { MarketingActivity, IMarketingActivityLog } from '../../application';

/** Marketing activity → the ByajBazaar logs service (activity_logs, category MARKETING). */
@Injectable()
export class ByajBazaarActivityLogAdapter implements IMarketingActivityLog {
  constructor(@Inject(ACTIVITY_LOGGER) private readonly activityLogger: IActivityLogger) {}

  record(activity: MarketingActivity): Promise<void> {
    return this.activityLogger.record({ category: EActivityLogCategory.Marketing, ...activity });
  }
}
