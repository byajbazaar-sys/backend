/**
 * Builds the value of the /byajbazaar/<stage>/marketing-config SSM parameter from the deploy environment
 * (.env.<stage>, loaded by useDotenv). Lambdas read it on cold start — see
 * src/marketing/infrastructure/config/marketing-settings.loader.ts. These keys are excluded from the Lambda env
 * (custom.dotenv.exclude) because the env is capped at 4 KB.
 */
const PREFIXES = ['MARKETING_', 'KAGGLE_'];
const EXTRA = ['CLOUDFLARE_TEXT_MODEL'];

module.exports = async () => {
  const values = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !value.trim()) continue;
    if (key === 'MARKETING_CONFIG_SSM') continue;
    if (PREFIXES.some((p) => key.startsWith(p)) || EXTRA.includes(key)) values[key] = value.trim();
  }
  const json = JSON.stringify(values);
  // Standard-tier SSM parameters hold up to 4 KB.
  if (json.length > 4096) throw new Error(`marketing-config is ${json.length} bytes; SSM standard tier allows 4096`);
  return json;
};
