import {
  KaggleCredential,
  MarketingCampaign,
  Photoshoot,
  RenderJob,
  MarketingActivity,
  ECampaignStatus,
  EPhotoshootStatus,
  ERenderJobStatus,
  IKaggleCredentialsRepository,
  IMarketingActivityLog,
  IMarketingCampaignsRepository,
  IMarketingPhotoshootsRepository,
  IRenderJobsRepository,
} from '../../application';
/**
 * Marketing activity log, recorded at the repository boundary so it covers every code path that changes a campaign,
 * photoshoot, render job or Kaggle account — without touching the services. Each wrapper calls the real repository
 * first; logging happens only after it succeeded and can never fail or change the result.
 */

type Method = (...args: any[]) => Promise<any>;
interface Hook<C = unknown> {
  /** Runs before the call (e.g. to read what is about to be deleted). */
  before?: (args: any[]) => Promise<C>;
  after: (args: any[], result: any, context: C) => MarketingActivity | null | undefined;
}

function withActivityLog<T extends object>(
  inner: T,
  log: IMarketingActivityLog,
  hooks: Partial<Record<keyof T, Hook<any>>>,
): T {
  return new Proxy(inner, {
    get(target, prop): unknown {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== 'function') return value;
      const hook = hooks[prop as keyof T];
      if (!hook) return (value as Method).bind(target);
      return async (...args: unknown[]): Promise<unknown> => {
        const context = hook.before ? await hook.before(args).catch((): undefined => undefined) : undefined;
        const result = await (value as Method).apply(target, args);
        try {
          const activity = hook.after(args, result, context);
          if (activity) await log.record(activity);
        } catch {
          // Logging never affects marketing.
        }
        return result;
      };
    },
  });
}

const TERMINAL_CAMPAIGN = new Set<string>([ECampaignStatus.Completed, ECampaignStatus.Partial, ECampaignStatus.Failed]);
const TERMINAL_PHOTOSHOOT = new Set<string>([
  EPhotoshootStatus.Ready,
  EPhotoshootStatus.Partial,
  EPhotoshootStatus.Failed,
]);
const TERMINAL_RENDER_JOB = new Set<string>([ERenderJobStatus.Done, ERenderJobStatus.Failed]);

export function campaignsWithActivityLog(
  inner: IMarketingCampaignsRepository,
  log: IMarketingActivityLog,
): IMarketingCampaignsRepository {
  return withActivityLog(inner, log, {
    create: {
      after: (_args, c: MarketingCampaign) => ({
        action: 'CAMPAIGN_CREATED',
        entityType: 'campaign',
        entityId: c.id,
        userId: c.userId,
        data: {
          title: c.title,
          style: c.style,
          quality: c.quality,
          sourceType: c.sourceType,
          inventoryItemId: c.inventoryItemId ?? null,
        },
      }),
    },
    update: {
      after: ([id, patch]: [string, Partial<MarketingCampaign>], c: MarketingCampaign | null) =>
        patch?.status && TERMINAL_CAMPAIGN.has(patch.status)
          ? {
              action: `CAMPAIGN_${patch.status}`,
              entityType: 'campaign',
              entityId: id,
              userId: c?.userId ?? null,
              data: { error: c?.error ?? patch.error ?? null, mergedVideoKey: c?.mergedVideoKey ?? null },
            }
          : null,
    },
    delete: {
      before: ([id]: [string]) => inner.findById(id),
      after: ([id]: [string], _result, c: MarketingCampaign | null) => ({
        action: 'CAMPAIGN_DELETED',
        entityType: 'campaign',
        entityId: id,
        userId: c?.userId ?? null,
        data: { title: c?.title ?? null, status: c?.status ?? null },
      }),
    },
  });
}

export function photoshootsWithActivityLog(
  inner: IMarketingPhotoshootsRepository,
  log: IMarketingActivityLog,
): IMarketingPhotoshootsRepository {
  return withActivityLog(inner, log, {
    create: {
      after: (_args, p: Photoshoot) => ({
        action: 'PHOTOSHOOT_CREATED',
        entityType: 'photoshoot',
        entityId: p.id,
        userId: p.userId,
        data: {
          title: p.title,
          setting: p.setting,
          model: p.model,
          outfit: p.outfit,
          aspect: p.aspect,
          inventoryItemId: p.inventoryItemId ?? null,
        },
      }),
    },
    update: {
      after: ([id, patch]: [string, Partial<Photoshoot>], p: Photoshoot | null) =>
        patch?.status && TERMINAL_PHOTOSHOOT.has(patch.status)
          ? {
              action: `PHOTOSHOOT_${patch.status}`,
              entityType: 'photoshoot',
              entityId: id,
              userId: p?.userId ?? null,
              data: { error: p?.error ?? patch.error ?? null },
            }
          : null,
    },
    delete: {
      before: ([id]: [string]) => inner.findById(id),
      after: ([id]: [string], _result, p: Photoshoot | null) => ({
        action: 'PHOTOSHOOT_DELETED',
        entityType: 'photoshoot',
        entityId: id,
        userId: p?.userId ?? null,
        data: { title: p?.title ?? null, status: p?.status ?? null },
      }),
    },
  });
}

export function renderJobsWithActivityLog(
  inner: IRenderJobsRepository,
  log: IMarketingActivityLog,
): IRenderJobsRepository {
  return withActivityLog(inner, log, {
    update: {
      after: ([id, patch]: [string, Partial<RenderJob>], job: RenderJob | null) =>
        patch?.status && TERMINAL_RENDER_JOB.has(patch.status)
          ? {
              action: `RENDER_JOB_${patch.status}`,
              entityType: 'render_job',
              entityId: id,
              userId: job?.userId ?? null,
              data: {
                kind: job?.kind ?? null,
                campaignId: job?.campaignId ?? null,
                workerId: job?.workerId ?? null,
                attempts: job?.attempts ?? null,
                error: job?.error ?? patch.error ?? null,
              },
            }
          : null,
    },
  });
}

export function kaggleCredentialsWithActivityLog(
  inner: IKaggleCredentialsRepository,
  log: IMarketingActivityLog,
): IKaggleCredentialsRepository {
  return withActivityLog(inner, log, {
    create: {
      after: (_args, c: KaggleCredential) => ({
        action: 'KAGGLE_ACCOUNT_ADDED',
        entityType: 'kaggle_account',
        entityId: c.username,
        data: { label: c.label ?? null, concurrency: c.concurrency, enabled: c.enabled },
      }),
    },
    update: {
      after: ([username, patch]: [string, Partial<KaggleCredential>], c: KaggleCredential | null) =>
        c
          ? {
              action: 'KAGGLE_ACCOUNT_UPDATED',
              entityType: 'kaggle_account',
              entityId: username,
              data: {
                // Never the key itself.
                apiKeyChanged: patch?.apiKey !== undefined,
                ...(patch?.label !== undefined && { label: patch.label }),
                ...(patch?.concurrency !== undefined && { concurrency: patch.concurrency }),
                ...(patch?.enabled !== undefined && { enabled: patch.enabled }),
              },
            }
          : null,
    },
    delete: {
      after: ([username]: [string], removed: boolean) =>
        removed ? { action: 'KAGGLE_ACCOUNT_REMOVED', entityType: 'kaggle_account', entityId: username } : null,
    },
  });
}
