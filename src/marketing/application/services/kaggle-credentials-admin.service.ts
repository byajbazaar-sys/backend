import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { KaggleAccount, KaggleCredential } from '../domain';
import { EKaggleAccountStatus } from '../enums';
import {
  CreateKaggleCredentialRequestModel,
  KaggleCredentialResponseModel,
  KaggleCredentialVerifyResponseModel,
  UpdateKaggleCredentialRequestModel,
} from '../models/kaggle-credentials.models';
import {
  IKaggleAccountsRepository,
  IKaggleCredentialsRepository,
  IKaggleWorkerPool,
  KAGGLE_ACCOUNTS_REPOSITORY,
  KAGGLE_CREDENTIALS_REPOSITORY,
  KAGGLE_WORKER_POOL,
} from '../ports';
import { MarketingScheduler } from './marketing-scheduler';

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
    private readonly scheduler: MarketingScheduler,
    @InjectPinoLogger(KaggleCredentialsAdminService.name) private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<KaggleCredentialResponseModel[]> {
    const [rows, accounts] = await Promise.all([this.credentials.list(), this.accounts.list()]);
    const byName = new Map(accounts.map((a) => [a.username, a]));
    return rows.map((row) => this.view(row, byName.get(row.username)));
  }

  async get(username: string): Promise<KaggleCredentialResponseModel> {
    const row = await this.require(username);
    return this.view(row, await this.accounts.find(row.username));
  }

  async create(body: CreateKaggleCredentialRequestModel): Promise<KaggleCredentialResponseModel> {
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
    await this.kickDispatch();
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
      return { username: row.username, valid: false, gpuHoursLeft: null, error: 'Stored key cannot be decrypted' };
    }
    try {
      const { hoursLeft } = await this.pool.verifyCredentials(row.username, row.apiKey);
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

  private view(row: KaggleCredential, account?: KaggleAccount | null): KaggleCredentialResponseModel {
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
      readyAt: account?.readyAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
