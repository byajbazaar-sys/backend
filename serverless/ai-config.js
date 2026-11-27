/**
 * Builds the value of the /byajbazaar/<stage>/ai-config SSM parameter from the deploy environment (.env.<stage>,
 * loaded by useDotenv). Lambdas read it on cold start — see src/ai/infrastructure/config/ai-settings.loader.ts.
 * These keys stay out of the Lambda env (capped at 4 KB) and out of app-config (serverless/app-config.js).
 * With no AI_* values the parameter is "{}": the assistant then uses the main database / bucket / queue and the
 * Cloudflare account pool for its model (Workers AI), while the rest of ByajBazaar works as before.
 */
const PREFIXES = ['AI_'];
const EXTRA = [];
const SKIP = ['AI_CONFIG_SSM'];

module.exports = async () => {
  const values = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !value.trim() || SKIP.includes(key)) continue;
    if (PREFIXES.some((p) => key.startsWith(p)) || EXTRA.includes(key)) values[key] = value.trim();
  }
  const json = JSON.stringify(values);
  // Standard-tier SSM parameters hold up to 4 KB.
  if (json.length > 4096) throw new Error(`ai-config is ${json.length} bytes; SSM standard tier allows 4096`);
  return json;
};
