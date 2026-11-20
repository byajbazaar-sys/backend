import { ColabEnterpriseConfig } from '../../../shared';

/** The fields of a Google service-account key file the Colab Enterprise client uses. */
export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
}

/** 2 × T4 on an 8-vCPU / 30 GB machine: the same GPUs as Kaggle's T4 × 2, so the notebooks run unchanged. */
export const COLAB_DEFAULTS: Omit<ColabEnterpriseConfig, 'projectId' | 'region' | 'bucket' | 'serviceAccountEmail'> = {
  machineType: 'n1-standard-8',
  acceleratorType: 'NVIDIA_TESLA_T4',
  acceleratorCount: 2,
  diskSizeGb: 200,
  maxSessionHours: 6,
};

/** Parses a pasted service-account key JSON; throws a readable error when it is not one. */
export function parseServiceAccountKey(json: string): ServiceAccountKey {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error('The service-account key is not valid JSON (paste the whole downloaded key file)');
  }
  if (parsed?.type !== 'service_account' || typeof parsed.client_email !== 'string') {
    throw new Error('The JSON is not a Google service-account key (type "service_account" with a client_email)');
  }
  if (typeof parsed.private_key !== 'string' || !parsed.private_key.includes('PRIVATE KEY')) {
    throw new Error('The service-account key has no private_key');
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    project_id: typeof parsed.project_id === 'string' ? parsed.project_id : undefined,
  };
}

/** The settings an admin gave, completed from the key (project, service account) and the defaults. */
export function colabSettings(
  key: ServiceAccountKey,
  given: Partial<ColabEnterpriseConfig> & { region: string; bucket: string },
  previous?: ColabEnterpriseConfig | null,
): ColabEnterpriseConfig {
  const pick = <K extends keyof ColabEnterpriseConfig>(name: K): ColabEnterpriseConfig[K] | undefined =>
    (given[name] as ColabEnterpriseConfig[K] | undefined) ?? previous?.[name];
  const projectId = pick('projectId') || key.project_id;
  if (!projectId) throw new Error('No Google Cloud project id: the key has none, enter it');
  return {
    projectId,
    region: given.region,
    bucket: given.bucket.replace(/^gs:\/\//, '').replace(/\/.*$/, ''),
    serviceAccountEmail: pick('serviceAccountEmail') || key.client_email,
    machineType: pick('machineType') || COLAB_DEFAULTS.machineType,
    acceleratorType: pick('acceleratorType') || COLAB_DEFAULTS.acceleratorType,
    acceleratorCount: pick('acceleratorCount') || COLAB_DEFAULTS.acceleratorCount,
    diskSizeGb: pick('diskSizeGb') || COLAB_DEFAULTS.diskSizeGb,
    maxSessionHours: pick('maxSessionHours') || COLAB_DEFAULTS.maxSessionHours,
  };
}
