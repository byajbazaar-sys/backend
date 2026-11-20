import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { JWT } from 'google-auth-library';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { ColabEnterpriseConfig, KagglePushResult, KaggleSessionState, ServiceAccountKey } from '../../application';

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export interface ColabAccount {
  /** The account id in kaggle_credentials (worker id). */
  id: string;
  key: ServiceAccountKey;
  config: ColabEnterpriseConfig;
}

/** Kernel names map to execution-job display names, unique per account (several accounts may share a project). */
export function colabDisplayName(accountId: string, kernelName: string): string {
  return `${accountId}--${kernelName}`.slice(0, 128);
}

/** Vertex AI notebook-execution job states → the Kaggle-style session states the scheduler understands. */
export function colabSessionState(jobState: string | undefined): KaggleSessionState {
  switch (jobState) {
    case 'JOB_STATE_QUEUED':
    case 'JOB_STATE_PENDING':
      return 'queued';
    case 'JOB_STATE_RUNNING':
    case 'JOB_STATE_UPDATING':
    case 'JOB_STATE_PAUSED':
      return 'running';
    case 'JOB_STATE_SUCCEEDED':
    case 'JOB_STATE_PARTIALLY_SUCCEEDED':
      return 'complete';
    case 'JOB_STATE_FAILED':
    case 'JOB_STATE_EXPIRED':
      return 'error';
    case 'JOB_STATE_CANCELLING':
    case 'JOB_STATE_CANCELLED':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/** One label value: lower-case letters, digits, - and _, at most 63 characters. */
function labelValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 63);
}

/** Access tokens per service account, kept for the life of the Lambda container (they last an hour). */
const TOKENS = new Map<string, { token: string; expiresAt: number }>();

/**
 * Colab Enterprise (Vertex AI notebook execution jobs): runs the same notebooks as Kaggle on a Google Cloud VM with
 * the account's GPUs, as the account's service account. Billed per use on the project — the scheduler only gives
 * these accounts work that no free Kaggle account can take.
 */
@Injectable()
export class ColabEnterpriseClient {
  constructor(@InjectPinoLogger(ColabEnterpriseClient.name) private readonly logger: PinoLogger) {}

  private async token(key: ServiceAccountKey): Promise<string> {
    const cached = TOKENS.get(key.client_email);
    if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
    const client = new JWT({ email: key.client_email, key: key.private_key, scopes: [SCOPE] });
    let credentials;
    try {
      credentials = await client.authorize();
    } catch (err) {
      throw new ServiceUnavailableException(
        `Google rejected the service-account key of ${key.client_email}: ${(err as Error).message}`,
      );
    }
    if (!credentials.access_token) throw new ServiceUnavailableException('Google returned no access token');
    TOKENS.set(key.client_email, {
      token: credentials.access_token,
      expiresAt: credentials.expiry_date ?? Date.now() + 50 * 60_000,
    });
    return credentials.access_token;
  }

  private base(config: ColabEnterpriseConfig): string {
    return (
      `https://${config.region}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}` +
      `/locations/${config.region}`
    );
  }

  private async call<T>(
    account: ColabAccount,
    method: 'GET' | 'POST',
    url: string,
    data?: unknown,
    params?: Record<string, string | number>,
  ): Promise<AxiosResponse<T>> {
    const token = await this.token(account.key);
    return axios.request<T>({
      method,
      url,
      data,
      params,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 60_000,
      validateStatus: () => true,
    });
  }

  private static reason(res: AxiosResponse): string {
    const error = (res.data as { error?: { message?: string; status?: string } } | undefined)?.error;
    return error?.message ? `${error.status ?? res.status}: ${error.message}` : `HTTP ${res.status}`;
  }

  /** Checks the key, the Vertex AI permission in the region and the bucket. Colab has no weekly quota (null). */
  async verify(account: ColabAccount): Promise<{ hoursLeft: number | null }> {
    const { config } = account;
    const jobs = await this.call(account, 'GET', `${this.base(config)}/notebookExecutionJobs`, undefined, {
      pageSize: 1,
    });
    if (jobs.status === 403) {
      throw new ServiceUnavailableException(
        `${account.key.client_email} may not run notebooks in ${config.projectId} (${ColabEnterpriseClient.reason(jobs)}). ` +
          'Grant it Vertex AI User and Service Account User, and enable the Vertex AI API.',
      );
    }
    if (jobs.status >= 300) {
      throw new ServiceUnavailableException(
        `Colab Enterprise check failed in ${config.projectId}/${config.region}: ${ColabEnterpriseClient.reason(jobs)}`,
      );
    }
    const bucket = await this.call(
      account,
      'GET',
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.bucket)}`,
    );
    if (bucket.status === 404) throw new ServiceUnavailableException(`Bucket gs://${config.bucket} does not exist`);
    if (bucket.status >= 300) {
      throw new ServiceUnavailableException(
        `${account.key.client_email} cannot use gs://${config.bucket} (${ColabEnterpriseClient.reason(bucket)}). ` +
          'Grant it Storage Object Admin on the bucket.',
      );
    }
    return { hoursLeft: null };
  }

  /** Starts the notebook as an execution job named after the kernel; it runs headless until it finishes. */
  async pushNotebook(
    account: ColabAccount,
    kernel: { name: string; title: string },
    notebook: Record<string, unknown>,
  ): Promise<KagglePushResult> {
    const { config } = account;
    const body = {
      displayName: colabDisplayName(account.id, kernel.name),
      directNotebookSource: { content: Buffer.from(JSON.stringify(notebook)).toString('base64') },
      customEnvironmentSpec: {
        machineSpec: {
          machineType: config.machineType,
          acceleratorType: config.acceleratorType,
          acceleratorCount: config.acceleratorCount,
        },
        persistentDiskSpec: { diskType: 'pd-ssd', diskSizeGb: String(config.diskSizeGb) },
        networkSpec: { enableInternetAccess: true },
      },
      gcsOutputUri: `gs://${config.bucket}/byajbazaar-runs`,
      serviceAccount: config.serviceAccountEmail || account.key.client_email,
      // The session stops itself before this; the timeout only bounds a hung VM's bill.
      executionTimeout: `${Math.round(config.maxSessionHours * 3600)}s`,
      labels: { app: 'byajbazaar', account: labelValue(account.id), kernel: labelValue(kernel.name) },
    };
    const res = await this.call<{ name?: string }>(account, 'POST', `${this.base(config)}/notebookExecutionJobs`, body);
    if (res.status >= 300) {
      const reason = ColabEnterpriseClient.reason(res);
      this.logger.error({ workerId: account.id, kernel: kernel.name, status: res.status, reason }, 'Colab run failed');
      throw new ServiceUnavailableException(`Colab Enterprise could not start on ${account.id}: ${reason}`);
    }
    const job = /notebookExecutionJobs\/([^/]+)/.exec(res.data?.name ?? '')?.[1];
    this.logger.info(
      { workerId: account.id, kernel: kernel.name, job, operation: res.data?.name },
      'Colab run started',
    );
    return {
      // "colab/<project>/<account>/<kernel>": the scheduler reads the kernel (last part), the admin UI links to the
      // project's Colab executions.
      ref: `colab/${config.projectId}/${account.id}/${kernel.name}`,
      url: job
        ? `https://console.cloud.google.com/vertex-ai/colab/execution-jobs/locations/${config.region}/${job}` +
          `?project=${config.projectId}`
        : '',
    };
  }

  /** State of the newest execution job of `kernelName` on the account (never throws: problems give "unknown"). */
  async sessionStatus(
    account: ColabAccount,
    kernelName: string,
  ): Promise<{ state: KaggleSessionState; failureMessage?: string }> {
    try {
      const res = await this.call<{
        notebookExecutionJobs?: { jobState?: string; status?: { message?: string } }[];
      }>(account, 'GET', `${this.base(account.config)}/notebookExecutionJobs`, undefined, {
        filter: `displayName="${colabDisplayName(account.id, kernelName)}"`,
        orderBy: 'create_time desc',
        pageSize: 1,
      });
      if (res.status >= 300) {
        return { state: 'unknown', failureMessage: `Colab status check failed (${ColabEnterpriseClient.reason(res)})` };
      }
      const job = res.data?.notebookExecutionJobs?.[0];
      if (!job) return { state: 'unknown', failureMessage: 'No Colab run found for this session' };
      return { state: colabSessionState(job.jobState), failureMessage: job.status?.message || undefined };
    } catch (err) {
      this.logger.warn({ workerId: account.id, kernelName, err: (err as Error).message }, 'Colab status check failed');
      return { state: 'unknown', failureMessage: (err as Error).message };
    }
  }
}
