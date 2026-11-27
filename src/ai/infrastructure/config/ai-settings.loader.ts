/**
 * AI settings (AI_*) are kept out of the Lambda environment, which is capped at 4 KB. The deploy stores them as one
 * JSON SSM parameter (serverless/ai-config.js) and every Lambda loads it here on cold start, before AiConfig is
 * built. Locally the values come from .env as usual.
 */
let loaded: Promise<void> | null = null;

export function aiSettingsParameter(): string | null {
  const explicit = process.env.AI_CONFIG_SSM?.trim();
  if (explicit) return explicit;
  // Not on Lambda (or serverless-offline) → values come from .env.
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.IS_OFFLINE) return null;
  const stage = process.env.NODE_ENV?.trim() || 'dev';
  return `/byajbazaar/${stage}/ai-config`;
}

/** Copies the SSM settings into process.env (values already set in the environment win). Never throws. */
export function loadAiSettings(): Promise<void> {
  loaded ??= (async (): Promise<void> => {
    const name = aiSettingsParameter();
    if (!name) return;
    try {
      const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
      const res = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
      const values = JSON.parse(res.Parameter?.Value || '{}') as Record<string, unknown>;
      for (const [key, value] of Object.entries(values)) {
        if (typeof value !== 'string' || !value) continue;
        if (!process.env[key]?.trim()) process.env[key] = value;
      }
    } catch (err) {
      // The assistant then runs on fallbacks (main database, no model key → 503); the rest of the app is unaffected.
      console.warn(`[ai] Could not load settings from SSM ${name}: ${(err as Error).message}`);
    }
  })();
  return loaded;
}
