import { Inject, Injectable } from '@nestjs/common';

import { ACTIVITY_LOGGER, EActivityLogCategory, IActivityLogger } from '../../../application';
import { IAiActivityLog } from '../../application';

/** Changes made through the assistant appear in ByajBazaar's activity log (logs service) next to the rest. */
@Injectable()
export class ByajBazaarAiActivityLogAdapter implements IAiActivityLog {
  constructor(@Inject(ACTIVITY_LOGGER) private readonly activity: IActivityLogger) {}

  async record(entry: Parameters<IAiActivityLog['record']>[0]): Promise<void> {
    await this.activity.record({
      category: EActivityLogCategory.Ai,
      action: entry.action,
      entityType: entry.entityType.slice(0, 40),
      entityId: entry.entityId ?? null,
      userId: entry.shopId,
      performedBy: entry.performedBy,
      channel: entry.channel ?? null,
      data: { ...entry.data, via: 'assistant' },
    });
  }
}
