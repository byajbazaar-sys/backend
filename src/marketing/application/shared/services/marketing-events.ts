import { Inject, Injectable } from '@nestjs/common';

import { KaggleJobStatusView } from '../../features';
import { MarketingCampaign } from '../domain';
import { IMarketingNotifier, MARKETING_NOTIFIER } from '../ports';
import { customerErrorMessage, customerStageMessage } from '../utils/customer-text';

/** Live ticks go to the customer's app: neutral wording, no render-account / notebook details. */
function customerJob(job: KaggleJobStatusView): KaggleJobStatusView {
  return {
    ...job,
    workerId: undefined,
    kernelRef: undefined,
    stageMessage: customerStageMessage(job.stageMessage) ?? null,
    error: customerErrorMessage(job.error) ?? null,
  };
}

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
        stageMessage: customerStageMessage(campaign.stageMessage),
        error: customerErrorMessage(campaign.error),
      },
      ...(job ? { job: customerJob(job) } : {}),
      refresh,
      timestamp: new Date().toISOString(),
    });
  }

  /** Progress tick of a photoshoot's image notebook (the client patches it in place, no refetch). */
  photoshootJob(userId: string, photoshootId: string, job: KaggleJobStatusView): Promise<void> {
    return this.notifier.notifyUser(userId, {
      type: 'marketingPhotoshootUpdated',
      photoshoot: { id: photoshootId },
      job: customerJob(job),
      refresh: false,
      timestamp: new Date().toISOString(),
    });
  }

  /** A voiceover changed (`refresh`) or its voice notebook ticked (`job`, patched in place). */
  voiceover(userId: string, voiceoverId: string, refresh: boolean, job?: KaggleJobStatusView): Promise<void> {
    return this.notifier.notifyUser(userId, {
      type: 'marketingVoiceoverUpdated',
      voiceover: { id: voiceoverId },
      ...(job ? { job: customerJob(job) } : {}),
      refresh,
      timestamp: new Date().toISOString(),
    });
  }

  brand(userId: string): Promise<void> {
    return this.notifier.notifyUser(userId, { type: 'marketingBrandUpdated', timestamp: new Date().toISOString() });
  }
}
