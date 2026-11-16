import { createHmac, timingSafeEqual } from 'crypto';

function secret(): string {
  const value = process.env.MARKETING_WORKER_SECRET?.trim() || process.env.TOKEN_SECRET?.trim();
  if (!value) throw new Error('MARKETING_WORKER_SECRET is not configured');
  return value;
}

/** Token that lets a Kaggle notebook report progress for exactly one job (and nothing else). */
export function signMarketingWorkerToken(jobId: string): string {
  return createHmac('sha256', secret()).update(`marketing-worker:${jobId}`).digest('hex');
}

export function verifyMarketingWorkerToken(jobId: string, token: unknown): boolean {
  if (typeof token !== 'string' || !jobId) return false;
  const expected = Buffer.from(signMarketingWorkerToken(jobId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
