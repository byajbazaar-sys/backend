/**
 * A warm GPU worker that does not boot (Kaggle keeps it queued, the notebook fails, or it cannot reach the API) is
 * found within minutes by its boot watch and — when it was started for ByajBazaar AI's Hindi voice — replaced on
 * another account. It used to sit in "starting" for 25 minutes (and the assistant showed "Hindi voice warming up"),
 * because nothing looked at it until the next dispatch.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MarketingRenderService } from '../../src/marketing/application/features/kaggle/service/marketing-render.service';
import {
  BOOT_CHECK_MS,
  BOOT_QUEUED_MAX_MS,
  BOOT_SILENT_MAX_MS,
  bootCheck,
  sessionStart,
  signMarketingWorkerToken,
  STARTING_MAX_MS,
} from '../../src/marketing/application/features/kaggle/utils';
import { ERenderJobKind, ERenderJobStatus, EKaggleAccountStatus } from '../../src/marketing/application/shared';

const MIN = 60_000;

describe('bootCheck (is a booting warm worker stuck?)', () => {
  it('waits while Kaggle is still getting it going', () => {
    assert.deepEqual(bootCheck({ ageMs: 2 * MIN, reported: false, state: 'error' }), { stuck: false });
    assert.deepEqual(bootCheck({ ageMs: BOOT_QUEUED_MAX_MS - 1, reported: false, state: 'queued' }), { stuck: false });
    assert.deepEqual(bootCheck({ ageMs: BOOT_SILENT_MAX_MS - 1, reported: false, state: 'running' }), { stuck: false });
    assert.deepEqual(bootCheck({ ageMs: 20 * MIN, reported: true, state: 'running' }), { stuck: false });
    assert.deepEqual(bootCheck({ ageMs: 20 * MIN, reported: false, state: 'unknown' }), { stuck: false });
  });

  it('gives up on a session Kaggle keeps queued, and rests the account', () => {
    assert.deepEqual(bootCheck({ ageMs: BOOT_QUEUED_MAX_MS, reported: false, state: 'queued' }), {
      stuck: true,
      rest: true,
      reason: 'Kaggle kept the session queued (no GPU free on the account)',
    });
  });

  it('says why: notebook error, cancelled, ended, or no internet', () => {
    const error = bootCheck({ ageMs: BOOT_CHECK_MS, reported: false, state: 'error', failureMessage: 'pip failed' });
    assert.deepEqual(error, {
      stuck: true,
      rest: true,
      reason: 'Kaggle stopped the notebook with an error: pip failed',
    });
    assert.deepEqual(bootCheck({ ageMs: BOOT_CHECK_MS, reported: false, state: 'cancelled' }), {
      stuck: true,
      rest: false,
      reason: 'The Kaggle session was cancelled',
    });
    assert.match(
      (bootCheck({ ageMs: BOOT_CHECK_MS, reported: false, state: 'complete' }) as { reason: string }).reason,
      /without reaching ByajBazaar/,
    );
    assert.match(
      (bootCheck({ ageMs: BOOT_SILENT_MAX_MS, reported: false, state: 'running' }) as { reason: string }).reason,
      /never reached ByajBazaar.*internet/,
    );
  });

  it('closes anything still not up after STARTING_MAX_MS (no rest when Kaggle could not be asked)', () => {
    assert.deepEqual(bootCheck({ ageMs: STARTING_MAX_MS, reported: true, state: 'unknown' }), {
      stuck: true,
      rest: false,
      reason: 'The warm GPU worker never reported in',
    });
  });

  it('a replacement keeps the time the assistant first asked', () => {
    const since = '2026-11-28T13:08:00.000Z';
    const start = sessionStart({
      status: ERenderJobStatus.Starting,
      startedAt: '2026-11-28T13:20:00.000Z',
      payload: { session: { state: 'starting', forAssistant: { since } } },
    });
    assert.equal(start?.toISOString(), since);
  });
});

// ------------------------------------------------------------------ the render service with in-memory fakes

interface Job {
  id: string;
  kind?: ERenderJobKind;
  status: ERenderJobStatus;
  workerId: string;
  slot?: number;
  error?: string | null;
  startedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  payload: { session: { forAssistant: { since: string; attempt: number }; reportedAt?: string } };
}

function harness(kaggleStates: Record<string, 'queued' | 'running' | 'error' | 'complete'> = {}) {
  process.env.MARKETING_WORKER_SECRET = 'test-worker-secret';
  process.env.AI_VOICE_GATEWAY_URL = 'wss://voice.example.com';
  process.env.AI_VOICE_TICKET_SECRET = 'x'.repeat(40);
  const jobs = new Map<string, Job>();
  let nextId = 1;
  const accounts = ['acct-a', 'acct-b', 'acct-c'].map((username) => ({
    username,
    status: EKaggleAccountStatus.Ready,
    gpuHoursLeft: 30,
    quotaCheckedAt: new Date(),
    cooldownUntil: null as Date | null,
    lastAssignedAt: null as Date | null,
    lastError: null as string | null,
    modelsDataset: null,
  }));
  const pushes: string[] = [];
  const scheduled: { message: Record<string, unknown>; options?: Record<string, unknown> }[] = [];
  const logs: string[] = [];
  const busy = () =>
    [...jobs.values()].filter((j) => [ERenderJobStatus.Starting, ERenderJobStatus.Running].includes(j.status));
  const jobsRepo = {
    create: async (data: Omit<Job, 'id'>) => {
      const job: Job = { id: `s${nextId++}`, createdAt: new Date(), updatedAt: new Date(), ...data };
      jobs.set(job.id, job);
      return job;
    },
    update: async (id: string, patch: Partial<Job>) => {
      const job = { ...jobs.get(id)!, ...patch, updatedAt: new Date() };
      jobs.set(id, job);
      return job;
    },
    findById: async (id: string) => jobs.get(id) ?? null,
    listSessions: async () => busy().filter((j) => j.kind === ERenderJobKind.Worker),
    countBusyByWorker: async () =>
      busy().reduce<Record<string, number>>((acc, j) => ({ ...acc, [j.workerId]: (acc[j.workerId] ?? 0) + 1 }), {}),
    busySlots: async (workerId: string) =>
      busy()
        .filter((j) => j.workerId === workerId)
        .map((j) => j.slot),
    countWaiting: async () => 0,
  };
  const accountsRepo = {
    list: async () => accounts,
    find: async (username: string) => accounts.find((a) => a.username === username) ?? null,
    update: async (username: string, patch: Record<string, unknown>) => {
      Object.assign(accounts.find((a) => a.username === username)!, patch);
    },
  };
  const pool = {
    workers: async () => accounts.map((a) => ({ id: a.username, concurrency: 2, provider: 'kaggle' })),
    pushNotebook: async (workerId: string, kernel: { name: string }) => {
      pushes.push(workerId);
      return { ref: `${workerId}/${kernel.name}`, url: '' };
    },
    sessionStatus: async (workerId: string) => ({ state: kaggleStates[workerId] ?? 'running' }),
  };
  const scheduler = {
    schedule: async (message: Record<string, unknown>, options?: Record<string, unknown>) => {
      scheduled.push({ message, options });
    },
  };
  const logger = {
    info: (_: unknown, msg: string) => logs.push(msg),
    warn: (_: unknown, msg: string) => logs.push(msg),
    error: (_: unknown, msg: string) => logs.push(msg),
  };
  const config = {
    publicApiBaseUrl: 'https://api.example.com',
    websocketUrl: 'wss://ws.example.com',
    kaggleSessionHours: 12,
  };
  const activity = { record: async () => undefined };
  const none = {} as never;
  const service = new MarketingRenderService(
    config as never,
    jobsRepo as never,
    accountsRepo as never,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    pool as never,
    scheduler as never,
    none,
    none,
    none,
    activity as never,
    none,
    logger as never,
  );
  /** Makes a session look `minutes` old. */
  const age = (id: string, minutes: number) => {
    const job = jobs.get(id)!;
    job.startedAt = new Date(Date.now() - minutes * MIN);
    job.updatedAt = new Date(Date.now() - minutes * MIN);
  };
  return { service, jobs, accounts, pushes, scheduled, logs, age };
}

describe('the warm worker boot watch', () => {
  it('a worker started for the assistant is watched from its start', async () => {
    const h = harness();
    assert.equal(await h.service.warmForAssistant(), 'starting');
    const [session] = [...h.jobs.values()];
    assert.equal(session.status, ERenderJobStatus.Starting);
    assert.equal(session.payload.session.forAssistant.attempt, 1);
    assert.deepEqual(
      h.scheduled.map((s) => [s.message.step, s.message.renderJobId, s.options?.delaySeconds]),
      [['watch', session.id, BOOT_CHECK_MS / 1000]],
    );
  });

  it('queued on Kaggle too long: the account rests and the next account boots a replacement', async () => {
    const h = harness({ 'acct-a': 'queued' });
    await h.service.warmForAssistant();
    const first = [...h.jobs.values()][0];
    const firstAccount = first.workerId;
    const since = first.payload.session.forAssistant.since;
    h.age(first.id, 9);
    await h.service.watch(first.id);

    const closed = h.jobs.get(first.id)!;
    assert.equal(closed.status, ERenderJobStatus.Failed);
    assert.equal(closed.error, 'Kaggle kept the session queued (no GPU free on the account)');
    const rested = h.accounts.find((a) => a.username === firstAccount)!;
    assert.ok(rested.cooldownUntil && rested.cooldownUntil.getTime() > Date.now());
    assert.match(String(rested.lastError), /queued/);

    const replacement = [...h.jobs.values()].find((j) => j.id !== first.id)!;
    assert.equal(replacement.status, ERenderJobStatus.Starting);
    assert.notEqual(replacement.workerId, firstAccount);
    assert.deepEqual(replacement.payload.session.forAssistant, { since, attempt: 2 });
    assert.ok(h.logs.includes('Warm GPU worker did not boot'));
  });

  it('still booting normally: re-armed, nothing else happens', async () => {
    const h = harness({ 'acct-a': 'queued', 'acct-b': 'queued', 'acct-c': 'queued' });
    await h.service.warmForAssistant();
    const first = [...h.jobs.values()][0];
    h.age(first.id, 4);
    await h.service.watch(first.id);
    assert.equal(h.jobs.get(first.id)!.status, ERenderJobStatus.Starting);
    assert.equal(h.pushes.length, 1);
    assert.equal(h.scheduled.filter((s) => s.message.step === 'watch').length, 2);
    assert.ok(h.logs.includes('Warm GPU worker still booting'));
  });

  it('reported in (sessionBooting) but not ready yet: not mistaken for "no internet"', async () => {
    const h = harness();
    await h.service.warmForAssistant();
    const first = [...h.jobs.values()][0];
    const token = signMarketingWorkerToken(first.id);
    await h.service.handleWorkerEvent({ jobId: first.id, token, stage: 'sessionBooting', message: 'booting' } as never);
    assert.ok(h.jobs.get(first.id)!.payload.session.reportedAt);
    assert.equal(h.jobs.get(first.id)!.payload.session.forAssistant.attempt, 1); // kept
    h.age(first.id, 12);
    await h.service.watch(first.id);
    assert.equal(h.jobs.get(first.id)!.status, ERenderJobStatus.Starting);
    assert.ok(h.logs.includes('Warm GPU worker reported in'));
  });

  it('gives up after a few tries', async () => {
    const h = harness({ 'acct-a': 'error', 'acct-b': 'error', 'acct-c': 'error' });
    await h.service.warmForAssistant();
    for (let i = 0; i < 5; i++) {
      const open = [...h.jobs.values()].find((j) => j.status === ERenderJobStatus.Starting);
      if (!open) break;
      h.age(open.id, 4);
      await h.service.watch(open.id);
    }
    assert.equal(h.pushes.length, 3);
    assert.ok([...h.jobs.values()].every((j) => j.status === ERenderJobStatus.Failed));
    assert.ok(h.logs.includes('Assistant voice: giving up on a GPU worker for now'));
  });

  it('a marketing worker that does not boot is not re-started for the assistant', async () => {
    const h = harness({ 'acct-a': 'complete' });
    const session = await (
      h.service as unknown as { startSession(a: string, s: number): Promise<boolean> }
    ).startSession('acct-a', 1);
    assert.equal(session, true);
    const [first] = [...h.jobs.values()];
    h.age(first.id, 4);
    await h.service.watch(first.id);
    assert.equal(h.jobs.get(first.id)!.status, ERenderJobStatus.Failed);
    assert.equal(h.pushes.length, 1);
  });
});
