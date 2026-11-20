import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { KaggleHealthService } from './kaggle-health.service';
import {
  KaggleAccount,
  KaggleCredential,
  EKaggleAccountStatus,
  ERenderJobKind,
  IKaggleAccountsRepository,
  KAGGLE_ACCOUNTS_REPOSITORY,
  IKaggleCredentialsRepository,
  KAGGLE_CREDENTIALS_REPOSITORY,
  IKaggleWorkerPool,
  KAGGLE_WORKER_POOL,
  IMarketingSettingsRepository,
  MARKETING_SETTINGS_REPOSITORY,
  IRenderJobsRepository,
  RENDER_JOBS_REPOSITORY,
  MarketingScheduler,
} from '../../../shared';
import { jobTarget, notebookOf } from '../utils';
import { MarketingRenderService } from './marketing-render.service';
import {
  BulkCreateKaggleCredentialResultModel,
  CreateKaggleCredentialRequestModel,
  KaggleCredentialResponseModel,
  KaggleCredentialVerifyResponseModel,
  KaggleHealthResponseModel,
  KaggleOverviewResponseModel,
  KaggleRecoveryResponseModel,
  KaggleSettingsModel,
  UpdateKaggleCredentialRequestModel,
} from '../models';

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/**
 * Admin management of the Kaggle accounts that render marketing videos. Changes trigger a dispatch, whose
 * syncAccounts() sets up new accounts and disables removed ones in kaggle_accounts.
 */
@Injectable()
export class KaggleCredentialsAdminService {
  constructor(
    @Inject(KAGGLE_CREDENTIALS_REPOSITORY) private readonly credentials: IKaggleCredentialsRepository,
    @Inject(KAGGLE_ACCOUNTS_REPOSITORY) private readonly accounts: IKaggleAccountsRepository,
    @Inject(KAGGLE_WORKER_POOL) private readonly pool: IKaggleWorkerPool,
    @Inject(RENDER_JOBS_REPOSITORY) private readonly jobs: IRenderJobsRepository,
    @Inject(MARKETING_SETTINGS_REPOSITORY) private readonly settings: IMarketingSettingsRepository,
    private readonly render: MarketingRenderService,
    private readonly kaggleHealth: KaggleHealthService,
    private readonly scheduler: MarketingScheduler,
    @InjectPinoLogger(KaggleCredentialsAdminService.name) private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<KaggleCredentialResponseModel[]> {
    const [rows, accounts, busy] = await Promise.all([
      this.credentials.list(),
      this.accounts.list(),
      this.jobs.countBusyByWorker(),
    ]);
    const byName = new Map(accounts.map((a) => [a.username, a]));
    return rows.map((row) => this.view(row, byName.get(row.username), busy[row.username] ?? 0));
  }

  async get(username: string): Promise<KaggleCredentialResponseModel> {
    const row = await this.require(username);
    const busy = await this.jobs.countBusyByWorker();
    return this.view(row, await this.accounts.find(row.username), busy[row.username] ?? 0);
  }

  /**
   * Adds several accounts at once (e.g. pasted "username:key[:concurrency]" lines). Each is verified and saved on its
   * own; one bad key does not stop the others. A single dispatch then sets up all new accounts in parallel.
   */
  async bulkCreate(accounts: CreateKaggleCredentialRequestModel[]): Promise<BulkCreateKaggleCredentialResultModel[]> {
    const results: BulkCreateKaggleCredentialResultModel[] = [];
    const seen = new Set<string>();
    for (const body of accounts) {
      const username = body.username.trim().toLowerCase();
      if (seen.has(username) || (await this.credentials.find(username))) {
        results.push({ username, result: 'exists' });
        continue;
      }
      seen.add(username);
      try {
        const created = await this.create({ ...body, username }, false);
        results.push({ username, result: 'created', gpuHoursLeft: created.gpuHoursLeft ?? null });
      } catch (err) {
        results.push({ username, result: 'failed', error: (err as Error).message });
      }
    }
    if (results.some((r) => r.result === 'created')) await this.kickDispatch();
    return results;
  }

  /** Runs the one-time setup notebook again now (instead of waiting for the automatic 6-hour retry). */
  async retrySetup(username: string): Promise<KaggleCredentialResponseModel> {
    const row = await this.require(username);
    if (!row.enabled) throw new BadRequestException('Enable the account first');
    const moved = await this.accounts.transition(
      row.username,
      [EKaggleAccountStatus.Failed, EKaggleAccountStatus.Ready, EKaggleAccountStatus.Disabled],
      { status: EKaggleAccountStatus.New, lastError: null, cooldownUntil: null },
    );
    if (!moved) throw new ConflictException('The account is already being set up');
    this.logger.info({ account: row.username }, 'Kaggle account setup re-run requested');
    await this.kickDispatch();
    return this.get(row.username);
  }

  /** Lets a cooling-down account take jobs again right away. */
  async clearCooldown(username: string): Promise<KaggleCredentialResponseModel> {
    const row = await this.require(username);
    await this.accounts.update(row.username, { cooldownUntil: null });
    await this.kickDispatch();
    return this.get(row.username);
  }

  health(): Promise<KaggleHealthResponseModel> {
    return this.kaggleHealth.report();
  }

  /** "Restart Kaggle": re-runs failed setups, ends cool-downs and moves stuck renders to other accounts. */
  recover(): Promise<KaggleRecoveryResponseModel> {
    return this.render.recover(true);
  }

  async restartJob(jobId: string): Promise<{ result: 'restarted' | 'dispatched' }> {
    const result = await this.render.restartRenderJob(jobId);
    if (result === 'not-running') throw new BadRequestException('That render is not waiting or running');
    this.logger.info({ jobId, result }, 'Render job restart requested by an admin');
    return { result };
  }

  getSettings(): Promise<KaggleSettingsModel> {
    return this.settings.kaggle();
  }

  async updateSettings(patch: KaggleSettingsModel): Promise<KaggleSettingsModel> {
    const saved = await this.settings.saveKaggle({
      autoRecover: patch.autoRecover,
      ...(patch.warmIdleMinutes !== undefined ? { warmIdleMinutes: patch.warmIdleMinutes } : {}),
    });
    this.logger.info(saved, 'Kaggle settings updated');
    return saved;
  }

  /** Capacity, queue length and what each account is running. */
  async overview(): Promise<KaggleOverviewResponseModel> {
    const [capacity, running] = await Promise.all([this.render.capacity(), this.jobs.listBusy()]);
    return {
      ...capacity,
      running: running
        .filter((job) => job.kind !== ERenderJobKind.Worker)
        .map((job) => ({
          id: job.id,
          kind: job.kind,
          notebook: notebookOf(job.kind),
          target: jobTarget(job),
          kernelRef: job.kernelRef ?? null,
          status: job.status,
          account: job.workerId ?? null,
          slot: job.slot ?? null,
          progress: job.progress,
          stageMessage: job.stageMessage ?? null,
          attempts: job.attempts,
          startedAt: job.startedAt ?? null,
          updatedAt: job.updatedAt ?? null,
        })),
    };
  }

  async create(body: CreateKaggleCredentialRequestModel, dispatch = true): Promise<KaggleCredentialResponseModel> {
    const username = body.username.trim().toLowerCase();
    if (await this.credentials.find(username)) {
      throw new ConflictException(`Kaggle account ${username} already exists`);
    }
    const gpuHoursLeft = body.skipVerification ? undefined : await this.verifyOrThrow(username, body.apiKey);

    const row = await this.credentials.create({
      username,
      apiKey: body.apiKey,
      concurrency: body.concurrency ?? 1,
      enabled: body.enabled ?? true,
      label: body.label || null,
    });
    // A previously removed account with the same name starts over with a fresh setup run.
    await this.accounts.transition(username, [EKaggleAccountStatus.Failed, EKaggleAccountStatus.Disabled], {
      status: EKaggleAccountStatus.New,
      lastError: null,
    });
    this.logger.info({ account: username }, 'Kaggle account added');
    if (gpuHoursLeft !== undefined) {
      await this.accounts.update(username, { gpuHoursLeft, quotaCheckedAt: new Date() });
    }
    if (dispatch) await this.kickDispatch();
    return { ...this.view(row, await this.accounts.find(username)), gpuHoursLeft };
  }

  async update(username: string, body: UpdateKaggleCredentialRequestModel): Promise<KaggleCredentialResponseModel> {
    const existing = await this.require(username);
    const keyChanged = body.apiKey !== undefined && body.apiKey !== existing.apiKey;
    if (keyChanged && !body.skipVerification) await this.verifyOrThrow(existing.username, body.apiKey);

    const updated = await this.credentials.update(existing.username, {
      apiKey: keyChanged ? body.apiKey : undefined,
      concurrency: body.concurrency,
      enabled: body.enabled,
      label: body.label === undefined ? undefined : body.label || null,
    });
    if (!updated) throw new NotFoundException(`Kaggle account ${username} not found`);

    // A failed setup is retried right away with the new key instead of waiting for the retry window.
    if (keyChanged) {
      await this.accounts.transition(existing.username, [EKaggleAccountStatus.Failed], {
        status: EKaggleAccountStatus.New,
        lastError: null,
      });
    }
    this.logger.info(
      { account: existing.username, keyChanged, enabled: updated.enabled, concurrency: updated.concurrency },
      'Kaggle account updated',
    );
    await this.kickDispatch();
    return this.view(updated, await this.accounts.find(existing.username));
  }

  async remove(username: string): Promise<void> {
    const normalized = username.trim().toLowerCase();
    if (!(await this.credentials.delete(normalized))) {
      throw new NotFoundException(`Kaggle account ${normalized} not found`);
    }
    this.logger.info({ account: normalized }, 'Kaggle account removed');
    await this.kickDispatch();
  }

  /** Re-checks the stored credentials against Kaggle (no notebook run). */
  async verify(username: string): Promise<KaggleCredentialVerifyResponseModel> {
    const row = await this.require(username);
    if (!row.apiKey) {
      return {
        username: row.username,
        valid: false,
        gpuHoursLeft: null,
        error: 'Stored key is missing or unreadable — re-enter it',
      };
    }
    try {
      const { hoursLeft } = await this.pool.verifyCredentials(row.username, row.apiKey);
      await this.accounts.update(row.username, { gpuHoursLeft: hoursLeft, quotaCheckedAt: new Date() });
      return { username: row.username, valid: true, gpuHoursLeft: hoursLeft };
    } catch (err) {
      return { username: row.username, valid: false, gpuHoursLeft: null, error: (err as Error).message };
    }
  }

  private async require(username: string): Promise<KaggleCredential> {
    const row = await this.credentials.find(username.trim().toLowerCase());
    if (!row) throw new NotFoundException(`Kaggle account ${username} not found`);
    return row;
  }

  private async verifyOrThrow(username: string, apiKey: string): Promise<number | null> {
    try {
      return (await this.pool.verifyCredentials(username, apiKey)).hoursLeft;
    } catch (err) {
      throw new BadRequestException(`Kaggle credentials check failed: ${(err as Error).message}`);
    }
  }

  /** Lets syncAccounts pick up the change. Failure to queue is not fatal: the next dispatch will. */
  private async kickDispatch(): Promise<void> {
    try {
      await this.scheduler.schedule({ step: 'dispatch' });
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'Could not schedule marketing dispatch');
    }
  }

  private view(row: KaggleCredential, account?: KaggleAccount | null, busySlots = 0): KaggleCredentialResponseModel {
    return {
      id: row.id,
      username: row.username,
      label: row.label ?? null,
      maskedKey: maskKey(row.apiKey),
      keyReadable: !!row.apiKey,
      concurrency: row.concurrency,
      enabled: row.enabled,
      status: account?.status ?? null,
      lastError: account?.lastError ?? null,
      gpuInfo: account?.gpuInfo ?? null,
      modelsDataset: account?.modelsDataset ?? null,
      readyAt: account?.readyAt ?? null,
      gpuHoursLeft: account?.gpuHoursLeft ?? null,
      quotaCheckedAt: account?.quotaCheckedAt ?? null,
      busySlots,
      cooldownUntil:
        account?.cooldownUntil && new Date(account.cooldownUntil).getTime() > Date.now() ? account.cooldownUntil : null,
      lastAssignedAt: account?.lastAssignedAt ?? null,
      jobsCompleted: account?.jobsCompleted ?? 0,
      jobsFailed: account?.jobsFailed ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
