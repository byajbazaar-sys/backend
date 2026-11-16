import { Inject, Injectable } from '@nestjs/common';

import { MarketingCampaign } from '../domain';
import { IMarketingNotifier, MARKETING_NOTIFIER } from '../ports';

/** Real-time events to the owner's open app sessions (AWS WebSocket). */
@Injectable()
export class MarketingEvents {
  constructor(@Inject(MARKETING_NOTIFIER) private readonly notifier: IMarketingNotifier) {}

  /** `refresh` = assets changed (client refetches the campaign); otherwise it is a progress tick. */
  campaign(campaign: MarketingCampaign, refresh = true): Promise<void> {
    return this.notifier.notifyUser(campaign.userId, {
      type: 'marketingCampaignUpdated',
      campaign: {
        id: campaign.id,
        status: campaign.status,
        progress: campaign.progress,
        stageMessage: campaign.stageMessage,
        error: campaign.error,
      },
      refresh,
      timestamp: new Date().toISOString(),
    });
  }

  brand(userId: string): Promise<void> {
    return this.notifier.notifyUser(userId, { type: 'marketingBrandUpdated', timestamp: new Date().toISOString() });
  }
}
