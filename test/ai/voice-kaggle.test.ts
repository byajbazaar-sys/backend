/**
 * ByajBazaar AI's Hindi voice on the warm Kaggle workers (ChatterBox): which replies go there and how they are written
 * for the voice, the workers' gateway token, the "assistant first" dispatch arithmetic, the pre-warm when a voice
 * session starts, and the worker notebook's voice lane (structure + Python syntax).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { assistant, owner } from './fakes';
import { AiConfig } from '../../src/ai/ai.config';
import type { IAiVoiceGpu } from '../../src/ai/application';
import { AiQueueController, toJob } from '../../src/ai/application/controllers/ai-jobs.controllers';
import { AiJobsService } from '../../src/ai/application/services/ai-jobs.service';
import { AiVoiceSessionsService, hindiAmount, mayReplyInHindi, speechFor, toHindiSpeech } from '../../src/ai/voice';
import {
  assistantVoiceLink,
  assistantVoiceSessions,
  buildWorkerSessionNotebook,
  workersNeeded,
} from '../../src/marketing/application/features/kaggle/utils';

process.env.AI_VOICE_GATEWAY_URL = 'wss://voice.test';
process.env.AI_VOICE_TICKET_SECRET = 's'.repeat(48);
process.env.AI_VOICE_GATEWAY_KEY = 'k'.repeat(48);

describe('which voice speaks a reply', () => {
  const plan = (text: string, multilingual = true) =>
    speechFor(text, { speakReplies: true, maxChars: 400, multilingual });

  it('Hindi script → ChatterBox on Kaggle, with numbers as Hindi words', () => {
    const p = plan('चाँदी की पायल, 5 ग्राम, 70% शुद्धता — ₹1,500।');
    assert.equal(p.engine, 'chatterbox');
    assert.equal(p.language, 'hi');
    assert.equal(p.text, 'चाँदी की पायल, पाँच ग्राम, सत्तर प्रतिशत शुद्धता — एक हज़ार पाँच सौ रुपये।');
  });

  it('English → Cloudflare; Gujarati and Latin Hinglish stay text; Hindi without the Kaggle lane stays text', () => {
    assert.equal(plan('Saved. Silver Payal, 5 g.').engine, 'aura');
    assert.equal(plan('પાયલ સાચવી').reason, 'not_english');
    assert.equal(plan('Payal ka weight batayein?').reason, 'not_english');
    assert.equal(plan('पायल सेव हो गई।', false).reason, 'not_english');
  });

  it('Indian amounts and grams the way they are said', () => {
    assert.equal(hindiAmount(150000), 'एक लाख पचास हज़ार');
    assert.equal(hindiAmount(15500), 'पंद्रह हज़ार पाँच सौ');
    assert.equal(hindiAmount(25000000), 'दो करोड़ पचास लाख');
    assert.equal(
      toHindiSpeech('₹1,50,000 का लोन, 2.5 ग्राम, 22K', 400),
      'एक लाख पचास हज़ार रुपये का लोन, ढाई ग्राम, बाईस कैरेट',
    );
  });
});

describe('warm workers and the assistant', () => {
  it('each worker gets the gateway lane URL and a signed token (none when voice is off)', () => {
    const session = randomUUID();
    const link = assistantVoiceLink(session, 'kaggle-user', 40_000)!;
    assert.equal(link.url, 'wss://voice.test/v1/tts-workers');
    const [v, payload, signature] = link.token.split('.');
    assert.equal(v, 'v1');
    assert.equal(signature, createHmac('sha256', 's'.repeat(48)).update(`v1.${payload}`).digest('base64url'));
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
    assert.deepEqual([claims.kind, claims.wid, claims.acct], ['tts-worker', session, 'kaggle-user']);
    process.env.AI_VOICE_KAGGLE_TTS = 'false';
    assert.equal(assistantVoiceLink(session, 'kaggle-user', 40_000), null);
    delete process.env.AI_VOICE_KAGGLE_TTS;
  });

  it('a worker speaking for the assistant only counts for voice jobs: image / video work gets its own worker', () => {
    assert.equal(workersNeeded({ waitingVoice: 0, waitingOther: 1, freeHot: 1, freeCold: 0 }), 1);
    assert.equal(workersNeeded({ waitingVoice: 1, waitingOther: 0, freeHot: 1, freeCold: 0 }), 0);
    assert.equal(workersNeeded({ waitingVoice: 1, waitingOther: 1, freeHot: 0, freeCold: 2 }), 0);
    assert.equal(workersNeeded({ waitingVoice: 2, waitingOther: 1, freeHot: 1, freeCold: 1 }), 1);
  });

  const voiceSessions = (jobs: unknown, prefs = assistant().preferences) =>
    new AiVoiceSessionsService(
      new AiConfig(),
      {
        create: async (input: {
          shopId: string;
          actorUserId: string;
          conversationId: string | null;
          expiresAt: Date;
        }) => ({
          id: randomUUID(),
          ...input,
          status: 'open' as const,
          endReason: null,
          createdAt: new Date(),
          endedAt: null,
          lastActivityAt: null,
          audioMs: 0,
          partialAudioMs: 0,
          sttRequests: 0,
          sttLatencyMs: 0,
          sttErrors: 0,
          ttsChars: 0,
          ttsRequests: 0,
          ttsLatencyMs: 0,
          ttsErrors: 0,
          turns: 0,
        }),
        listOpen: async () => [],
        totals: async () => ({ sessions: 0, audioMs: 0, partialAudioMs: 0, ttsChars: 0, turns: 0 }),
      } as never,
      prefs,
      assistant().audit,
      jobs as never,
    );

  it('starting a voice session readies the Hindi voice and tells the app where it stands', async () => {
    const asked: Date[] = [];
    const state = { state: 'starting' as const, since: new Date().toISOString(), typicalSeconds: 240 };
    const grant = await voiceSessions({
      prepareHindiVoice: async (now: Date) => (asked.push(now), state),
    }).start(owner(), {});
    assert.equal(asked.length, 1);
    assert.deepEqual(grant.hindiVoice, state);
  });

  it('… but not for people whose replies are English (no GPU worker started for them)', async () => {
    const a = assistant();
    await a.preferences.save(owner().actorUserId, { language: 'en' });
    let asked = 0;
    const grant = await voiceSessions({ prepareHindiVoice: async () => (asked++, null) }, a.preferences).start(
      owner(),
      {},
    );
    assert.equal(asked, 0);
    assert.equal(grant.hindiVoice, null);
  });

  it('which reply settings can need the Hindi voice', () => {
    const p = (language: string, speechLanguage = 'auto', speakReplies = true) =>
      mayReplyInHindi({ language, speechLanguage, speakReplies } as never);
    assert.equal(p('hi'), true);
    assert.equal(p('auto'), true);
    assert.equal(p('auto', 'mr'), true);
    assert.equal(p('auto', 'en'), false);
    assert.equal(p('en'), false);
    assert.equal(p('hinglish'), false);
    assert.equal(p('hi', 'auto', false), false);
  });
});

describe('the Hindi voice warm-up (voice.prewarm)', () => {
  const quiet = { info() {}, warn() {}, error() {}, debug() {} };
  const jobsService = (gpu: Partial<IAiVoiceGpu>, queue: { enabled: boolean; enqueue?: unknown }) =>
    new AiJobsService(
      new AiConfig(),
      {} as never,
      queue as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      gpu as IAiVoiceGpu,
      quiet as never,
    );

  it('the queue delivery runs the prewarm job (it used to run `undefined` and fail every time)', async () => {
    assert.deepEqual(toJob({ type: 'voice.prewarm' } as never), { type: 'voice.prewarm' });
    const ran: unknown[] = [];
    const controller = new AiQueueController(
      { run: async (job: unknown) => (ran.push(job), 'starting') } as never,
      { verify: async () => true } as never,
      quiet as never,
    );
    assert.deepEqual(await controller.deliver({ header: () => 'sig' } as never, { type: 'voice.prewarm' } as never), {
      ok: true,
    });
    assert.deepEqual(ran, [{ type: 'voice.prewarm' }]);
  });

  it('no worker up or booting → one is asked for (queued, once a minute) and the app sees "starting"', async () => {
    const queued: unknown[] = [];
    const jobs = jobsService(
      { status: async () => ({ state: 'idle', since: null }) },
      { enabled: true, enqueue: async (job: unknown, options: unknown) => queued.push([job, options]) },
    );
    const now = new Date('2026-11-28T10:00:30Z');
    const state = await jobs.prepareHindiVoice(now);
    assert.deepEqual(state, { state: 'starting', since: now.toISOString(), typicalSeconds: 240 });
    assert.deepEqual(queued, [
      [{ type: 'voice.prewarm' }, { deduplicationId: `ai-voice-prewarm-${Math.floor(now.getTime() / 60_000)}` }],
    ]);
  });

  it('a worker already up or booting → nothing is started; none can start → "unavailable"', async () => {
    const since = new Date('2026-11-28T09:58:00Z');
    let queued = 0;
    const queue = { enabled: true, enqueue: async () => void queued++ };
    const up = await jobsService({ status: async () => ({ state: 'running', since }) }, queue).prepareHindiVoice();
    assert.deepEqual(up, { state: 'warm', since: since.toISOString(), typicalSeconds: 240 });
    const boot = await jobsService({ status: async () => ({ state: 'starting', since }) }, queue).prepareHindiVoice();
    assert.equal(boot.state, 'starting');
    assert.equal(boot.since, since.toISOString());
    const none = await jobsService(
      { status: async () => ({ state: 'unavailable', since: null, reason: 'resting' }) },
      queue,
    ).prepareHindiVoice();
    assert.equal(none.state, 'unavailable');
    assert.equal(queued, 0);
  });

  it('a failed status check still asks for a worker; a failed queue says "unavailable" (voice itself still works)', async () => {
    let queued = 0;
    const asked = await jobsService(
      {
        status: async () => {
          throw new Error('db down');
        },
      },
      { enabled: true, enqueue: async () => void queued++ },
    ).prepareHindiVoice();
    assert.equal(asked.state, 'starting');
    assert.equal(queued, 1);
    const failed = await jobsService(
      { status: async () => ({ state: 'idle', since: null }) },
      {
        enabled: true,
        enqueue: async () => {
          throw new Error('QStash publish failed (500)');
        },
      },
    ).prepareHindiVoice();
    assert.equal(failed.state, 'unavailable');
  });

  it('which warm sessions can speak for the assistant', () => {
    const now = Date.parse('2026-11-28T10:00:00Z');
    const ago = (ms: number) => new Date(now - ms).toISOString();
    const session = (status: string, state: string, updatedMsAgo: number, hotUntil: string | null = null) => ({
      id: `${status}-${state}-${updatedMsAgo}`,
      status,
      startedAt: ago(updatedMsAgo + 60_000),
      updatedAt: ago(updatedMsAgo),
      payload: { session: { state, aiVoiceHotUntil: hotUntil } },
    });
    const { running, booting } = assistantVoiceSessions(
      [
        session('RUNNING', 'idle', 30_000), // polling: yes
        session('RUNNING', 'idle', 10 * 60_000), // stopped polling: gone
        session('RUNNING', 'busy', 60_000), // image / video job: its voice engine is down
        session('RUNNING', 'busy', 60_000, new Date(now + 60_000).toISOString()), // speaking for the assistant: yes
        session('STARTING', 'starting', 2 * 60_000), // booting: yes
        session('STARTING', 'starting', 40 * 60_000), // never reported in: stuck
      ],
      now,
    );
    assert.deepEqual(
      running.map((s) => s.id),
      ['RUNNING-idle-30000', 'RUNNING-busy-60000'],
    );
    assert.equal(running[1].payload.session.aiVoiceHotUntil !== null, true);
    assert.deepEqual(
      booting.map((s) => s.id),
      ['STARTING-starting-120000'],
    );
  });
});

describe('the warm worker notebook', () => {
  const cells = (aiVoice?: { url: string; token: string }) =>
    (
      buildWorkerSessionNotebook({
        jobId: randomUUID(),
        token: 't',
        apiBaseUrl: 'https://api.test',
        wsUrl: 'wss://ws.test',
        sessionSeconds: 40_000,
        provider: 'kaggle',
        ...(aiVoice ? { aiVoice } : {}),
      }) as { cells: { cell_type: string; source: string }[] }
    ).cells
      .filter((c) => c.cell_type === 'code')
      .map((c) => c.source);

  it('has the AI voice lane, reports assistant demand at every poll, and stops heavy work from racing it', () => {
    const code = cells({ url: 'wss://voice.test/v1/tts-workers', token: 'v1.a.b' }).join('\n');
    assert.match(code, /def ai_lane\(\)/);
    assert.match(code, /"front": True/, 'assistant prompts go first in the voice engine');
    assert.match(code, /"aiVoiceHot": ai_voice_hot\(\)/);
    assert.match(code, /with WORKER\["voice_lock"\]/);
    assert.match(code, /FL_ChatterboxMultilingualTTS/);
  });

  it('is valid Python with and without the lane (checked with python3 when available)', (t) => {
    const probe = spawnSync('python3', ['--version']);
    if (probe.error) {
      t.skip('python3 not installed');
      return;
    }
    for (const variant of [cells(), cells({ url: 'wss://voice.test/v1/tts-workers', token: 'v1.a.b' })]) {
      for (const source of variant) {
        const result = spawnSync('python3', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: source });
        assert.equal(result.status, 0, result.stderr.toString());
      }
    }
  });
});
