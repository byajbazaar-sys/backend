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
import { AiVoiceSessionsService, hindiAmount, speechFor, toHindiSpeech } from '../../src/ai/voice';
import {
  assistantVoiceLink,
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

  it('starting a voice session asks for a warm worker (queued job) when the Kaggle voice is on', async () => {
    const a = assistant();
    const jobs: unknown[] = [];
    const sessions = new AiVoiceSessionsService(
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
      a.preferences,
      a.audit,
      { submit: async (job: unknown) => (jobs.push(job), { queued: true }) } as never,
    );
    await sessions.start(owner(), {});
    assert.deepEqual(jobs, [{ type: 'voice.prewarm' }]);
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
