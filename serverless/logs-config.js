/**
 * Builds the value of the /byajbazaar/<stage>/logs-config SSM parameter from the deploy environment (.env.<stage>,
 * loaded by useDotenv). Lambdas read it on cold start — see src/logs/infrastructure/config/logs-settings.loader.ts.
 * These keys are excluded from the Lambda env (custom.dotenv.exclude) because the env is capped at 4 KB.
 * With no LOGS_DB_* values the parameter is "{}" and logs stay in the main database.
 */
const PREFIXES = ['LOGS_DB_'];

module.exports = async () => {
  const values = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !value.trim()) continue;
    if (PREFIXES.some((p) => key.startsWith(p))) values[key] = value.trim();
  }
  const json = JSON.stringify(values);
  // Standard-tier SSM parameters hold up to 4 KB.
  if (json.length > 4096) throw new Error(`logs-config is ${json.length} bytes; SSM standard tier allows 4096`);
  return json;
};
