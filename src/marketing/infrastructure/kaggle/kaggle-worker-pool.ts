import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { ColabAccount, ColabEnterpriseClient } from './colab-enterprise.client';
import { KaggleApiClient } from './kaggle-api.client';
import {
  IKaggleCredentialsRepository,
  IKaggleWorkerPool,
  KAGGLE_CREDENTIALS_REPOSITORY,
  KaggleCredential,
  KagglePushResult,
  KaggleSessionState,
  KaggleWorker,
  ModelCacheTarget,
  parseServiceAccountKey,
} from '../../application';

type CredentialLike = Pick<KaggleCredential, 'username' | 'apiKey' | 'provider' | 'colab'>;

/**
 * Every GPU account behind one pool: Kaggle accounts (free weekly quota) and Colab Enterprise projects (billed).
 * Accounts come from kaggle_credentials (managed by admins), read on every call so changes apply at once; each call
 * goes to the account's own provider.
 */
@Injectable()
export class KaggleWorkerPool implements IKaggleWorkerPool {
  constructor(
    @Inject(KAGGLE_CREDENTIALS_REPOSITORY) private readonly credentials: IKaggleCredentialsRepository,
    private readonly kaggle: KaggleApiClient,
    private readonly colab: ColabEnterpriseClient,
    @InjectPinoLogger(KaggleWorkerPool.name) private readonly logger: PinoLogger,
  ) {}

  async workers(): Promise<KaggleWorker[]> {
    const rows = await this.credentials.list({ enabled: true });
    const workers: KaggleWorker[] = [];
    for (const row of rows) {
      if (!row.apiKey) {
        this.logger.warn({ account: row.username }, 'GPU account key could not be read — account skipped');
        continue;
      }
      if (row.provider === 'colab' && !row.colab) {
        this.logger.warn({ account: row.username }, 'Colab account has no settings — account skipped');
        continue;
      }
      workers.push({
        id: row.username,
        concurrency: Math.min(4, Math.max(1, row.concurrency || 1)),
        provider: row.provider,
        ...(row.provider === 'colab' && row.colab ? { maxSessionSeconds: row.colab.maxSessionHours * 3600 } : {}),
      });
    }
    return workers;
  }

  private async row(workerId: string): Promise<KaggleCredential> {
    const row = await this.credentials.find(workerId);
    if (!row || !row.enabled || !row.apiKey) {
      throw new ServiceUnavailableException(`GPU account ${workerId} is not configured`);
    }
    return row;
  }

  /** The Colab account behind a credential row (throws when its key or settings are unusable). */
  private colabAccount(row: CredentialLike): ColabAccount {
    if (!row.colab) throw new ServiceUnavailableException(`Colab account ${row.username} has no settings`);
    let key;
    try {
      key = parseServiceAccountKey(row.apiKey);
    } catch (err) {
      throw new ServiceUnavailableException((err as Error).message);
    }
    return { id: row.username, key, config: row.colab };
  }

  async gpuQuota(workerId: string): Promise<{ hoursLeft: number | null }> {
    return this.verifyCredentials(await this.row(workerId));
  }

  async verifyCredentials(credential: CredentialLike): Promise<{ hoursLeft: number | null }> {
    if (credential.provider === 'colab') return this.colab.verify(this.colabAccount(credential));
    return this.kaggle.quota({ id: credential.username, key: credential.apiKey });
  }

  async sessionStatus(
    workerId: string,
    kernelName: string,
  ): Promise<{ state: KaggleSessionState; failureMessage?: string }> {
    let row: KaggleCredential;
    try {
      row = await this.row(workerId);
    } catch (err) {
      return { state: 'unknown', failureMessage: (err as Error).message };
    }
    if (row.provider === 'colab') {
      try {
        return await this.colab.sessionStatus(this.colabAccount(row), kernelName);
      } catch (err) {
        return { state: 'unknown', failureMessage: (err as Error).message };
      }
    }
    return this.kaggle.sessionStatus({ id: row.username, key: row.apiKey }, kernelName);
  }

  async pushNotebook(
    workerId: string,
    kernel: { name: string; title: string },
    notebook: Record<string, unknown>,
    options: { datasets?: string[] } = {},
  ): Promise<KagglePushResult> {
    const row = await this.row(workerId);
    // Colab mounts no datasets: the session notebook copies its model cache from the account's bucket itself.
    if (row.provider === 'colab') return this.colab.pushNotebook(this.colabAccount(row), kernel, notebook);
    return this.kaggle.pushNotebook({ id: row.username, key: row.apiKey }, kernel, notebook, options.datasets ?? []);
  }

  async modelCacheTarget(workerId: string): Promise<ModelCacheTarget> {
    const row = await this.row(workerId);
    if (row.provider === 'colab') {
      const { config } = this.colabAccount(row);
      return { provider: 'colab', gcsPrefix: `gs://${config.bucket}/byajbazaar-models` };
    }
    return { provider: 'kaggle', username: row.username, key: row.apiKey };
  }
}
