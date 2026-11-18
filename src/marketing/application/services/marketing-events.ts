import { Inject, Injectable } from '@nestjs/common';

import { MarketingCampaign } from '../domain';
import { IMarketingNotifier, MARKETING_NOTIFIER } from '../ports';
import { KaggleJobStatusView } from './kaggle-job-status';

/** Real-time events to the owner's open app sessions (AWS WebSocket). */
@Injectable()
export class MarketingEvents {
  constructor(@Inject(MARKETING_NOTIFIER) private readonly notifier: IMarketingNotifier) {}

  /**
   * `refresh` = assets changed (client refetches the campaign); otherwise it is a progress tick. `job` is the
   * Kaggle notebook (image or video) the tick came from, so the app can show each notebook's own status.
   */
  campaign(campaign: MarketingCampaign, refresh = true, job?: KaggleJobStatusView): Promise<void> {
    return this.notifier.notifyUser(campaign.userId, {
      type: 'marketingCampaignUpdated',
      campaign: {
        id: campaign.id,
        status: campaign.status,
        progress: campaign.progress,
        stageMessage: campaign.stageMessage,
        error: campaign.error,
      },
      ...(job ? { job } : {}),
      refresh,
      timestamp: new Date().toISOString(),
    });
  }

  /** Progress tick of a photoshoot's image notebook (the client patches it in place, no refetch). */
  photoshootJob(userId: string, photoshootId: string, job: KaggleJobStatusView): Promise<void> {
    return this.notifier.notifyUser(userId, {
      type: 'marketingPhotoshootUpdated',
      photoshoot: { id: photoshootId },
      job,
      refresh: false,
      timestamp: new Date().toISOString(),
    });
  }

  brand(userId: string): Promise<void> {
    return this.notifier.notifyUser(userId, { type: 'marketingBrandUpdated', timestamp: new Date().toISOString() });
  }
}
