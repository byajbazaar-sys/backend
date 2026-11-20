/**
 * App settings kept out of the Lambda environment, which AWS caps at 4 KB. On deploy, serverless/app-config.js
 * writes every value of .env.<stage> as JSON chunks into the SSM parameters /byajbazaar/<stage>/app-config/1..N
 * (serverless.yml resources). Each Lambda copies them into process.env here, before Nest builds its config.
 * serverless-offline loads .env.<stage> instead; plain `nest start` reads .env as before.
 */
const PARTS = 3;
let loaded: Promise<void> | null = null;

function stage(): string {
  return process.env.NODE_ENV?.trim() || 'dev';
}

/** The SSM parameter names, or null when not running on Lambda. */
export function appSettingsParameters(): string[] | null {
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.IS_OFFLINE) return null;
  const prefix = process.env.APP_CONFIG_SSM_PREFIX?.trim() || `/byajbazaar/${stage()}/app-config`;
  return Array.from({ length: PARTS }, (_, i) => `${prefix}/${i + 1}`);
}

function apply(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string' || !value) continue;
    if (!process.env[key]?.trim()) process.env[key] = value; // values already in the environment win
  }
}

async function fetchOnce(names: string[]): Promise<void> {
  const { SSMClient, GetParametersCommand } = await import('@aws-sdk/client-ssm');
  const res = await new SSMClient({}).send(new GetParametersCommand({ Names: names, WithDecryption: true }));
  if (!res.Parameters?.length) throw new Error(`none of ${names.join(', ')} exists`);
  for (const parameter of res.Parameters) apply(JSON.parse(parameter.Value || '{}') as Record<string, unknown>);
}

/**
 * Copies the app settings into process.env once per container. Throws when they cannot be read on Lambda: without
 * them there is no database or token secret, and a clear error beats a confusing one later.
 */
export function loadAppSettings(): Promise<void> {
  loaded ??= (async () => {
    if (process.env.IS_OFFLINE) {
      const dotenv = await import('dotenv');
      dotenv.config({ path: `.env.${stage()}` }); // never overrides what is already set
      return;
    }
    const names = appSettingsParameters();
    if (!names) return;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await fetchOnce(names);
        return;
      } catch (err) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
    loaded = null; // let the next invocation try again
    throw new Error(`Could not load app settings from SSM (${names[0]}…): ${(lastError as Error)?.message}`);
  })();
  return loaded;
}
