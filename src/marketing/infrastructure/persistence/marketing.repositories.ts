import { Injectable } from '@nestjs/common';
import { FindOptionsWhere, In, LessThan, Not, ObjectLiteral, Repository } from 'typeorm';

import {
  KaggleAccountEntity,
  KaggleCredentialEntity,
  MarketingBrandEntity,
  MarketingCampaignEntity,
  MarketingSceneEntity,
  MarketingSettingEntity,
  MarketingScheduledPostEntity,
  RenderJobEntity,
} from './entities';
import { MarketingDatabase } from './marketing-database';
import {
  KaggleAccount,
  KaggleCredential,
  MarketingBrand,
  MarketingCampaign,
  MarketingScene,
  MarketingScheduledPost,
  RenderJob,
  DEFAULT_KAGGLE_SETTINGS,
  KaggleSettings,
  BUSY_RENDER_STATUSES,
  ECampaignStatus,
  EKaggleAccountStatus,
  ERenderJobKind,
  ERenderJobStatus,
  IKaggleAccountsRepository,
  IKaggleCredentialsRepository,
  IMarketingBrandsRepository,
  IMarketingCampaignsRepository,
  IMarketingScenesRepository,
  IMarketingSettingsRepository,
  IMarketingScheduledPostsRepository,
  IRenderJobsRepository,
} from '../../application';
import { MarketingSecretCipher } from '../crypto';

/** UPDATE … RETURNING through TypeORM on Postgres returns [rows, affectedCount]. */
function returnedRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as Record<string, unknown>[];
  return (Array.isArray(result) ? result : []) as Record<string, unknown>[];
}

function recordOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Unexpected scheduled-post database row');
  }
  return value as Record<string, unknown>;
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`Scheduled-post row is missing ${key}`);
  return value;
}

function optionalString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`Scheduled-post row has an invalid ${key}`);
  return value;
}

function dateValue(value: unknown, key: string): Date {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw new Error(`Scheduled-post row has an invalid ${key}`);
  return date;
}

abstract class MarketingRepositoryBase<E extends ObjectLiteral> {
  protected constructor(
    protected readonly db: MarketingDatabase,
    private readonly entity: new () => E,
  ) {}

  protected repo(): Promise<Repository<E>> {
    return this.db.repository(this.entity);
  }
}

@Injectable()
export class MarketingCampaignsRepository
  extends MarketingRepositoryBase<MarketingCampaignEntity>
  implements IMarketingCampaignsRepository
{
  constructor(db: MarketingDatabase) {
    super(db, MarketingCampaignEntity);
  }

  async create(campaign: Omit<MarketingCampaign, 'id'>): Promise<MarketingCampaign> {
    const repo = await this.repo();
    return (await repo.save(repo.create(campaign as Partial<MarketingCampaignEntity>))) as MarketingCampaign;
  }

  async findById(id: string): Promise<MarketingCampaign | null> {
    return (await (await this.repo()).findOne({ where: { id } })) as MarketingCampaign | null;
  }

  async findForUser(id: string, userId: string): Promise<MarketingCampaign | null> {
    return (await (await this.repo()).findOne({ where: { id, userId } })) as MarketingCampaign | null;
  }

  async listForUser(userId: string, limit: number): Promise<MarketingCampaign[]> {
    return (await (
      await this.repo()
    ).find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    })) as MarketingCampaign[];
  }

  async update(id: string, patch: Partial<MarketingCampaign>): Promise<MarketingCampaign | null> {
    await (await this.repo()).update({ id }, patch as Partial<MarketingCampaignEntity>);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await (await this.repo()).delete({ id });
  }

  async countActiveForUser(userId: string): Promise<number> {
    return (await this.repo()).count({
      where: {
        userId,
        status: In([ECampaignStatus.Planning, ECampaignStatus.WaitingGpu, ECampaignStatus.Rendering]),
      },
    });
  }
}

@Injectable()
export class MarketingScenesRepository
  extends MarketingRepositoryBase<MarketingSceneEntity>
  implements IMarketingScenesRepository
{
  constructor(db: MarketingDatabase) {
    super(db, MarketingSceneEntity);
  }

  async createMany(scenes: Omit<MarketingScene, 'id'>[]): Promise<MarketingScene[]> {
    const repo = await this.repo();
    return (await repo.save(scenes.map((s) => repo.create(s as Partial<MarketingSceneEntity>)))) as MarketingScene[];
  }

  async listForCampaign(campaignId: string): Promise<MarketingScene[]> {
    return (await (await this.repo()).find({ where: { campaignId }, order: { index: 'ASC' } })) as MarketingScene[];
  }

  async findByIndex(campaignId: string, index: number): Promise<MarketingScene | null> {
    return (await (await this.repo()).findOne({ where: { campaignId, index } })) as MarketingScene | null;
  }

  async update(id: string, patch: Partial<MarketingScene>): Promise<MarketingScene | null> {
    const repo = await this.repo();
    await repo.update({ id }, patch as Partial<MarketingSceneEntity>);
    return (await repo.findOne({ where: { id } })) as MarketingScene | null;
  }

  async deleteForCampaign(campaignId: string): Promise<void> {
    await (await this.repo()).delete({ campaignId });
  }
}

@Injectable()
export class MarketingScheduledPostsRepository implements IMarketingScheduledPostsRepository {
  constructor(private readonly db: MarketingDatabase) {}

  private repo(): Promise<Repository<MarketingScheduledPostEntity>> {
    return this.db.repository(MarketingScheduledPostEntity);
  }

  async create(post: Omit<MarketingScheduledPost, 'id'>): Promise<MarketingScheduledPost> {
    const repo = await this.repo();
    return (await repo.save(repo.create(post as Partial<MarketingScheduledPostEntity>))) as MarketingScheduledPost;
  }

  async findForUser(id: string, userId: string): Promise<MarketingScheduledPost | null> {
    return (await (await this.repo()).findOne({ where: { id, userId } })) as MarketingScheduledPost | null;
  }

  async listForUser(userId: string, limit: number): Promise<MarketingScheduledPost[]> {
    return (await (
      await this.repo()
    ).find({ where: { userId }, order: { scheduledAt: 'DESC' }, take: limit })) as MarketingScheduledPost[];
  }

  async update(id: string, patch: Partial<MarketingScheduledPost>): Promise<MarketingScheduledPost | null> {
    const repo = await this.repo();
    await repo.update({ id }, patch as Partial<MarketingScheduledPostEntity>);
    return (await repo.findOne({ where: { id } })) as MarketingScheduledPost | null;
  }

  async cancelForUser(id: string, userId: string): Promise<boolean> {
    const result = await (await this.repo()).update({ id, userId, status: 'SCHEDULED' }, { status: 'CANCELLED' });
    return !!result.affected;
  }

  async hasOpenForSource(
    userId: string,
    sourceType: 'campaign' | 'photoshoot',
    sourceId: string,
    sourceIndex?: number,
  ): Promise<boolean> {
    return (await this.repo()).exists({
      where: {
        userId,
        sourceType,
        sourceId,
        ...(sourceIndex === undefined ? {} : { sourceIndex }),
        status: In(['SCHEDULED', 'PUBLISHING']),
      },
    });
  }

  async claimDue(now: Date, limit: number): Promise<MarketingScheduledPost[]> {
    const result: unknown = await (
      await this.db.connection()
    ).query(
      `WITH due AS (
         SELECT "id" FROM "marketing_scheduled_posts"
         WHERE "status" = 'SCHEDULED' AND "scheduled_at" <= $1
         ORDER BY "scheduled_at" ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE "marketing_scheduled_posts" AS posts
       SET "status" = 'PUBLISHING', "updated_at" = $1
       FROM due
       WHERE posts."id" = due."id"
       RETURNING posts.*`,
      [now, limit],
    );
    if (!Array.isArray(result)) throw new Error('Unexpected scheduled-post query result');
    return result.map((raw) => {
      const row = recordOf(raw);
      return {
        id: requiredString(row, 'id'),
        userId: requiredString(row, 'user_id'),
        mediaType: requiredString(row, 'media_type') as MarketingScheduledPost['mediaType'],
        sourceType: requiredString(row, 'source_type') as MarketingScheduledPost['sourceType'],
        sourceId: requiredString(row, 'source_id'),
        sourceIndex: row.source_index === null || row.source_index === undefined ? null : Number(row.source_index),
        sourceTitle: requiredString(row, 'source_title'),
        assetKey: requiredString(row, 'asset_key'),
        caption: requiredString(row, 'caption'),
        scheduledAt: dateValue(row.scheduled_at, 'scheduled_at'),
        status: requiredString(row, 'status') as MarketingScheduledPost['status'],
        instagramMediaId: optionalString(row, 'instagram_media_id'),
        error: optionalString(row, 'error'),
        publishedAt:
          row.published_at !== null && row.published_at !== undefined
            ? dateValue(row.published_at, 'published_at')
            : null,
        createdAt:
          row.created_at !== null && row.created_at !== undefined ? dateValue(row.created_at, 'created_at') : undefined,
        updatedAt:
          row.updated_at !== null && row.updated_at !== undefined ? dateValue(row.updated_at, 'updated_at') : undefined,
      };
    });
  }
}

@Injectable()
export class MarketingBrandsRepository
  extends MarketingRepositoryBase<MarketingBrandEntity>
  implements IMarketingBrandsRepository
{
  constructor(db: MarketingDatabase) {
    super(db, MarketingBrandEntity);
  }

  async find(userId: string): Promise<MarketingBrand | null> {
    return (await (await this.repo()).findOne({ where: { userId } })) as MarketingBrand | null;
  }

  async upsert(brand: Partial<MarketingBrand> & { userId: string }): Promise<MarketingBrand> {
    const repo = await this.repo();
    const existing = await repo.findOne({ where: { userId: brand.userId } });
    if (existing) {
      await repo.update({ userId: brand.userId }, brand as Partial<MarketingBrandEntity>);
    } else {
      await repo.insert(brand as Partial<MarketingBrandEntity>);
    }
    return (await repo.findOne({ where: { userId: brand.userId } })) as MarketingBrand;
  }
}

@Injectable()
export class KaggleAccountsRepository
  extends MarketingRepositoryBase<KaggleAccountEntity>
  implements IKaggleAccountsRepository
{
  constructor(db: MarketingDatabase) {
    super(db, KaggleAccountEntity);
  }

  async list(): Promise<KaggleAccount[]> {
    return (await (await this.repo()).find({ order: { username: 'ASC' } })) as KaggleAccount[];
  }

  async find(username: string): Promise<KaggleAccount | null> {
    return (await (await this.repo()).findOne({ where: { username } })) as KaggleAccount | null;
  }

  async upsert(account: Partial<KaggleAccount> & { username: string }): Promise<KaggleAccount> {
    const repo = await this.repo();
    await repo.upsert(account as Partial<KaggleAccountEntity>, ['username']);
    return (await repo.findOne({ where: { username: account.username } })) as KaggleAccount;
  }

  async transition(username: string, from: EKaggleAccountStatus[], patch: Partial<KaggleAccount>): Promise<boolean> {
    const result = await (
      await this.repo()
    ).update(
      { username, status: In(from) } as FindOptionsWhere<KaggleAccountEntity>,
      patch as Partial<KaggleAccountEntity>,
    );
    return (result.affected ?? 0) > 0;
  }

  async update(username: string, patch: Partial<Omit<KaggleAccount, 'username'>>): Promise<void> {
    await (await this.repo()).update({ username }, patch as Partial<KaggleAccountEntity>);
  }

  async recordOutcome(username: string, outcome: 'completed' | 'failed'): Promise<void> {
    const column = outcome === 'completed' ? 'jobs_completed' : 'jobs_failed';
    await (
      await this.repo()
    ).query(`UPDATE "kaggle_accounts" SET "${column}" = "${column}" + 1 WHERE "username" = $1`, [username]);
  }
}

@Injectable()
export class KaggleCredentialsRepository
  extends MarketingRepositoryBase<KaggleCredentialEntity>
  implements IKaggleCredentialsRepository
{
  constructor(
    db: MarketingDatabase,
    private readonly cipher: MarketingSecretCipher,
  ) {
    super(db, KaggleCredentialEntity);
  }

  /** A key that can't be decrypted (secret changed) comes back as '' so one bad row never breaks the pool. */
  private toDomain(row: KaggleCredentialEntity): KaggleCredential {
    const { apiKeyEncrypted, ...rest } = row;
    let apiKey = '';
    try {
      apiKey = this.cipher.decrypt(apiKeyEncrypted);
    } catch {
      // Left empty: the worker pool skips it and the admin list reports it as unreadable.
    }
    return { ...rest, apiKey };
  }

  async list(filter: { enabled?: boolean } = {}): Promise<KaggleCredential[]> {
    const where: FindOptionsWhere<KaggleCredentialEntity> = {};
    if (filter.enabled !== undefined) where.enabled = filter.enabled;
    const rows = await (await this.repo()).find({ where, order: { username: 'ASC' } });
    return rows.map((row) => this.toDomain(row));
  }

  async find(username: string): Promise<KaggleCredential | null> {
    const row = await (await this.repo()).findOne({ where: { username } });
    return row ? this.toDomain(row) : null;
  }

  async create(credential: Omit<KaggleCredential, 'id' | 'createdAt' | 'updatedAt'>): Promise<KaggleCredential> {
    const repo = await this.repo();
    const { apiKey, ...rest } = credential;
    const saved = await repo.save(repo.create({ ...rest, apiKeyEncrypted: this.cipher.encrypt(apiKey) }));
    return this.toDomain(saved);
  }

  async update(
    username: string,
    patch: Partial<Pick<KaggleCredential, 'apiKey' | 'concurrency' | 'enabled' | 'label'>>,
  ): Promise<KaggleCredential | null> {
    const repo = await this.repo();
    const { apiKey, ...rest } = patch;
    const changes = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    ) as Partial<KaggleCredentialEntity>;
    if (apiKey !== undefined) changes.apiKeyEncrypted = this.cipher.encrypt(apiKey);
    if (Object.keys(changes).length) await repo.update({ username }, changes);
    return this.find(username);
  }

  async delete(username: string): Promise<boolean> {
    const result = await (await this.repo()).delete({ username });
    return (result.affected ?? 0) > 0;
  }
}

@Injectable()
export class RenderJobsRepository extends MarketingRepositoryBase<RenderJobEntity> implements IRenderJobsRepository {
  constructor(db: MarketingDatabase) {
    super(db, RenderJobEntity);
  }

  async create(job: Omit<RenderJob, 'id'>): Promise<RenderJob> {
    const repo = await this.repo();
    return (await repo.save(repo.create(job as unknown as Partial<RenderJobEntity>))) as unknown as RenderJob;
  }

  async findById(id: string): Promise<RenderJob | null> {
    return (await (await this.repo()).findOne({ where: { id } })) as unknown as RenderJob | null;
  }

  async update(id: string, patch: Partial<RenderJob>): Promise<RenderJob | null> {
    await (await this.repo()).update({ id }, patch as unknown as Partial<RenderJobEntity>);
    return this.findById(id);
  }

  async countBusyByWorker(): Promise<Record<string, number>> {
    const rows = await (await this.repo())
      .createQueryBuilder('j')
      .select('j.worker_id', 'workerId')
      .addSelect('COUNT(*)', 'count')
      .where('j.status IN (:...statuses)', { statuses: BUSY_RENDER_STATUSES })
      .andWhere('j.worker_id IS NOT NULL')
      .groupBy('j.worker_id')
      .getRawMany<{ workerId: string; count: string }>();
    return Object.fromEntries(rows.map((r) => [r.workerId, Number(r.count)]));
  }

  async listBusy(): Promise<RenderJob[]> {
    return (await (
      await this.repo()
    ).find({
      where: { status: In(BUSY_RENDER_STATUSES) },
      order: { startedAt: 'ASC' },
    })) as unknown as RenderJob[];
  }

  async listWaiting(limit: number): Promise<RenderJob[]> {
    return (await (
      await this.repo()
    ).find({
      where: { status: ERenderJobStatus.Waiting, kind: Not(ERenderJobKind.Setup) },
      order: { createdAt: 'ASC' },
      take: limit,
    })) as unknown as RenderJob[];
  }

  async countWaiting(): Promise<number> {
    return (await this.repo()).count({
      where: { status: ERenderJobStatus.Waiting, kind: Not(ERenderJobKind.Setup) },
    });
  }

  async countWaitingByKind(): Promise<Partial<Record<ERenderJobKind, number>>> {
    const rows = await (await this.repo())
      .createQueryBuilder('j')
      .select('j.kind', 'kind')
      .addSelect('COUNT(*)', 'count')
      .where('j.status = :status', { status: ERenderJobStatus.Waiting })
      .andWhere('j.kind <> :setup', { setup: ERenderJobKind.Setup })
      .groupBy('j.kind')
      .getRawMany<{ kind: ERenderJobKind; count: string }>();
    return Object.fromEntries(rows.map((r) => [r.kind, Number(r.count)]));
  }

  async busySlots(workerId: string): Promise<number[]> {
    const rows = await (
      await this.repo()
    ).find({
      select: { slot: true },
      where: { workerId, status: In(BUSY_RENDER_STATUSES), kind: Not(ERenderJobKind.Setup) },
    });
    return rows.map((r) => r.slot).filter((s): s is number => s !== null && s !== undefined);
  }

  async claimNext(workerId: string, includeWork: boolean): Promise<RenderJob | null> {
    const rows = returnedRows(
      await (
        await this.repo()
      ).query(
        `UPDATE "marketing_render_jobs"
            SET "status" = $1, "worker_id" = $2, "started_at" = now(), "updated_at" = now(),
                "progress" = 0, "stage_message" = 'Starting GPU worker'
          WHERE "id" = (
            SELECT "id" FROM "marketing_render_jobs"
             WHERE "status" = $3
               AND (("kind" = $4 AND "worker_id" = $2) OR ($5::boolean AND "kind" <> $4))
             ORDER BY ("kind" = $4) DESC, "created_at" ASC
             LIMIT 1
             FOR UPDATE SKIP LOCKED
          )
          RETURNING "id"`,
        [ERenderJobStatus.Starting, workerId, ERenderJobStatus.Waiting, ERenderJobKind.Setup, includeWork],
      ),
    );
    const id = rows[0]?.id as string | undefined;
    return id ? this.findById(id) : null;
  }

  async findStale(statuses: ERenderJobStatus[], olderThan: Date): Promise<RenderJob[]> {
    return (await (
      await this.repo()
    ).find({
      where: { status: In(statuses), updatedAt: LessThan(olderThan) },
    })) as unknown as RenderJob[];
  }

  async findOpenFor(filter: { campaignId?: string; userId?: string; kind?: string }): Promise<RenderJob | null> {
    const where: FindOptionsWhere<RenderJobEntity> = {
      status: In([ERenderJobStatus.Waiting, ...BUSY_RENDER_STATUSES]),
    };
    if (filter.campaignId) where.campaignId = filter.campaignId;
    if (filter.userId) where.userId = filter.userId;
    if (filter.kind) where.kind = filter.kind;
    return (await (await this.repo()).findOne({ where, order: { createdAt: 'DESC' } })) as unknown as RenderJob | null;
  }

  async latestForCampaigns(campaignIds: string[]): Promise<RenderJob[]> {
    if (!campaignIds.length) return [];
    const repo = await this.repo();
    const rows = returnedRows(
      await repo.query(
        `SELECT DISTINCT ON ("campaign_id", "kind") "id"
           FROM "marketing_render_jobs"
          WHERE "campaign_id" = ANY($1::uuid[]) AND "kind" = ANY($2::varchar[])
          ORDER BY "campaign_id", "kind", "created_at" DESC`,
        [campaignIds, [ERenderJobKind.Images, ERenderJobKind.Campaign]],
      ),
    );
    return this.byIds(rows.map((r) => r.id as string));
  }

  async latestForPhotoshoots(photoshootIds: string[]): Promise<RenderJob[]> {
    if (!photoshootIds.length) return [];
    const repo = await this.repo();
    const rows = returnedRows(
      await repo.query(
        `SELECT DISTINCT ON ("payload"->'imageGeneration'->>'photoshootId') "id"
           FROM "marketing_render_jobs"
          WHERE "kind" = $2 AND "payload"->'imageGeneration'->>'photoshootId' = ANY($1::text[])
          ORDER BY "payload"->'imageGeneration'->>'photoshootId', "created_at" DESC`,
        [photoshootIds, ERenderJobKind.Images],
      ),
    );
    return this.byIds(rows.map((r) => r.id as string));
  }

  async listRecentFinished(limit: number): Promise<RenderJob[]> {
    return (await (
      await this.repo()
    ).find({
      where: { status: In([ERenderJobStatus.Done, ERenderJobStatus.Failed]), kind: Not(ERenderJobKind.Setup) },
      order: { finishedAt: { direction: 'DESC', nulls: 'LAST' }, updatedAt: 'DESC' },
      take: limit,
    })) as unknown as RenderJob[];
  }

  private async byIds(ids: string[]): Promise<RenderJob[]> {
    if (!ids.length) return [];
    return (await (await this.repo()).find({ where: { id: In(ids) } })) as unknown as RenderJob[];
  }
}

/** marketing_settings. Read on use (a few ms) so a change made by an admin applies on every server at once. */
@Injectable()
export class MarketingSettingsRepository
  extends MarketingRepositoryBase<MarketingSettingEntity>
  implements IMarketingSettingsRepository
{
  constructor(db: MarketingDatabase) {
    super(db, MarketingSettingEntity);
  }

  async kaggle(): Promise<KaggleSettings> {
    try {
      const row = await (await this.repo()).findOne({ where: { key: 'kaggle' } });
      return { ...DEFAULT_KAGGLE_SETTINGS, ...((row?.value as Partial<KaggleSettings>) ?? {}) };
    } catch {
      // Table not migrated yet: defaults.
      return { ...DEFAULT_KAGGLE_SETTINGS };
    }
  }

  async saveKaggle(patch: Partial<KaggleSettings>): Promise<KaggleSettings> {
    const next = { ...(await this.kaggle()), ...patch };
    await (await this.repo()).upsert({ key: 'kaggle', value: next }, ['key']);
    return next;
  }
}
