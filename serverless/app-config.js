/**
 * Builds the /byajbazaar/<stage>/app-config/1..3 SSM parameters (serverless.yml resources) from .env.<stage>, so no
 * app setting has to live in the Lambda environment (AWS caps it at 4 KB — the deploy failed at 4190 bytes). Lambdas
 * load them on cold start: libs/aws/app-settings.loader.ts.
 *
 * Every key of .env.<stage> goes in, except the ones with their own parameter (MARKETING_* / KAGGLE_* →
 * marketing-config, LOGS_DB_* → logs-config, the Google Play key file), AWS-reserved names and the few keys the
 * Lambda environment still sets itself (serverless/providers.yml). A new setting needs no change here.
 *
 * Only the .env file is read — never the deploying shell's environment (which holds its own AWS credentials).
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

/** How many parameters exist (serverless.yml AppConfigParameter1..N, libs/aws/app-settings.loader.ts PARTS). */
const PARTS = 3;
/** Standard-tier SSM parameters hold up to 4 KB. */
const MAX_BYTES = 4096;
/** Set in the Lambda environment itself (serverless/providers.yml). */
const LAMBDA_ENV = [
  'NODE_ENV',
  'NO_COLOR',
  'AWS_NODEJS_CONNECTION_REUSE_ENABLED',
  'TRY_ON_LAMBDA_NAME',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_SSM_PATH',
  'APP_CONFIG_SSM_PREFIX',
];
/** Stored in their own parameters, or never shipped. */
const OWN_PARAMETER = /^(MARKETING_|KAGGLE_|LOGS_DB_)/;
const SKIP = ['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'IS_OFFLINE', 'MARKETING_CONFIG_SSM', 'LOGS_CONFIG_SSM'];
const AWS_RESERVED = /^(AWS_|LAMBDA_TASK_ROOT$|LAMBDA_RUNTIME_DIR$|_HANDLER$|_X_AMZN_TRACE_ID$|TZ$)/;
/** What serverless/providers.yml used to default when a key was missing from .env. */
const DEFAULTS = {
  DB_PORT: '5432',
  DB_NAME: 'byajbazaar_db',
  DB_USER: 'postgres',
  TRYON_API_TIMEOUT_MS: '90000',
  TRYON_API_MAX_RETRIES: '2',
  CLOUDFLARE_TRYON_MODEL: '@cf/black-forest-labs/flux-2-klein-9b',
  CLOUDFLARE_TRYON_TIMEOUT_MS: '120000',
  CLOUDFLARE_TRYON_MAX_RETRIES: '2',
  TRY_ON_INLINE: 'false',
  S3_BUCKET_REGION: 'ap-south-1',
  REDIS_MAX_RECONNECTION_ATTEMPTS: '10',
  REDIS_RECONNECTION_DELAY_MS: '5000',
  APP_INTEGRITY_ALLOW_DEV: 'false',
  META_GRAPH_API_VERSION: 'v22.0',
  QDRANT_COLLECTION: 'customer_faces',
  QDRANT_VECTOR_SIZE: '512',
  FACE_MATCH_THRESHOLD: '0.45',
  FACE_COMPARE_TIMEOUT_MS: '30000',
};

const cache = {};

/** The settings for a stage, packed into PARTS JSON chunks of at most MAX_BYTES each. */
function chunksFor(stage) {
  if (cache[stage]) return cache[stage];
  const file = path.join(__dirname, '..', `.env.${stage}`);
  const parsed = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  const values = { ...DEFAULTS };
  for (const [key, raw] of Object.entries(parsed)) {
    const value = String(raw ?? '').trim();
    if (!value || LAMBDA_ENV.includes(key) || SKIP.includes(key)) continue;
    if (OWN_PARAMETER.test(key) || AWS_RESERVED.test(key)) continue;
    values[key] = value;
  }
  const chunks = [{}];
  for (const key of Object.keys(values).sort()) {
    const entry = { [key]: values[key] };
    if (Buffer.byteLength(JSON.stringify(entry)) > MAX_BYTES) throw new Error(`${key} alone is over ${MAX_BYTES} bytes`);
    let last = chunks[chunks.length - 1];
    if (Buffer.byteLength(JSON.stringify({ ...last, ...entry })) > MAX_BYTES) {
      last = {};
      chunks.push(last);
    }
    last[key] = values[key];
  }
  if (chunks.length > PARTS) {
    throw new Error(
      `app-config needs ${chunks.length} SSM parameters but ${PARTS} exist: add AppConfigParameter${PARTS + 1} in ` +
        `serverless.yml and raise PARTS in serverless/app-config.js and libs/aws/app-settings.loader.ts`,
    );
  }
  cache[stage] = chunks;
  return chunks;
}

async function part(n, { resolveVariable }) {
  const stage = await resolveVariable('sls:stage');
  return JSON.stringify(chunksFor(stage)[n - 1] || {});
}

module.exports = {
  chunksFor,
  part1: (ctx) => part(1, ctx),
  part2: (ctx) => part(2, ctx),
  part3: (ctx) => part(3, ctx),
};
