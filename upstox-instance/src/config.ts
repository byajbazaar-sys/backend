import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8090) || 8090,
  host: process.env.HOST?.trim() || '0.0.0.0',
  upstox: {
    accessToken: required('UPSTOX_ACCESS_TOKEN'),
    goldInstrumentKey: process.env.UPSTOX_GOLD_INSTRUMENT_KEY?.trim() || 'MCX_FO|483079',
    silverInstrumentKey: process.env.UPSTOX_SILVER_INSTRUMENT_KEY?.trim() || 'MCX_FO|495214',
    goldLtpGrams: Number(process.env.UPSTOX_GOLD_LTP_GRAMS ?? 10) || 10,
    silverLtpPerKg: process.env.UPSTOX_SILVER_LTP_PER_KG !== 'false',
  },
  jwt: {
    secret: required('TOKEN_SECRET'),
    audience: process.env.TOKEN_AUDIENCE?.trim() || 'usersAudience',
    issuer: process.env.TOKEN_ISSUER?.trim() || 'UsersIssuer',
    algorithm: (process.env.TOKEN_ALG?.trim() || 'HS256') as 'HS256',
  },
};
