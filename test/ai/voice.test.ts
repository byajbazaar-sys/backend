/**
 * ByajBazaar AI voice (API side): session tickets, limits, tenant isolation, the transcribed turn through the
 * EXISTING orchestrator (same conversation as typed messages), spoken confirm / cancel rules, transcript clean-up
 * and what is read aloud. The audio itself is handled by cloudflare/voice-gateway (its own tests).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { assistant, callTool, OTHER_SHOP, owner, say, SHOP, silentLogger, staff } from './fakes';
import { AiConfig } from '../../src/ai/ai.config';
import {
  AiVoiceConversationService,
  AiVoiceGatewayGuard,
  AiVoiceSession,
  AiVoiceSessionsService,
  AiVoiceTotals,
  AiVoiceUsageDelta,
  IAiVoiceAccess,
  IAiVoiceSessionsRepository,
  isEnglishForSpeech,
  normalizeTranscript,
  signVoiceTicket,
  speechFor,
  toSpeakableText,
  verifyVoiceTicket,
  voiceIntentOf,
} from '../../src/ai/voice';

process.env.AI_VOICE_GATEWAY_URL = 'wss://voice.test';
process.env.AI_VOICE_TICKET_SECRET = 's'.repeat(48);
process.env.AI_VOICE_GATEWAY_KEY = 'k'.repeat(48);
const SECRET = 's'.repeat(48);

const statusOf = (err: unknown): number => (err as { getStatus?: () => number }).getStatus?.() ?? 0;
const codeOf = (err: unknown): string | undefined =>
  ((err as { getResponse?: () => unknown }).getResponse?.() as { code?: string } | undefined)?.code;

class MemoryVoiceSessions implements IAiVoiceSessionsRepository {
  readonly rows = new Map<string, AiVoiceSession>();
  async create(input: { shopId: string; actorUserId: string; conversationId: string | null; expiresAt: Date }) {
    const row: AiVoiceSession = {
      id: randomUUID(),
      ...input,
      status: 'open',
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
    };
    this.rows.set(row.id, row);
    return { ...row };
  }
  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }
  async listOpen(filter: { actorUserId?: string; shopId?: string }, now: Date) {
    return [...this.rows.values()].filter(
      (r) =>
        r.status === 'open' &&
        r.expiresAt > now &&
        (!filter.actorUserId || r.actorUserId === filter.actorUserId) &&
        (!filter.shopId || r.shopId === filter.shopId),
    );
  }
  async totals(filter: { actorUserId?: string; shopId?: string }, since: Date): Promise<AiVoiceTotals> {
    const rows = [...this.rows.values()].filter(
      (r) =>
        r.createdAt >= since &&
        (!filter.actorUserId || r.actorUserId === filter.actorUserId) &&
        (!filter.shopId || r.shopId === filter.shopId),
    );
    const sum = (k: keyof AiVoiceSession) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    return {
      sessions: rows.length,
      audioMs: sum('audioMs'),
      partialAudioMs: sum('partialAudioMs'),
      ttsChars: sum('ttsChars'),
      turns: sum('turns'),
    };
  }
  async addUsage(id: string, delta: AiVoiceUsageDelta) {
    const row = this.rows.get(id)!;
    for (const [k, v] of Object.entries(delta)) {
      (row as unknown as Record<string, number>)[k] += Number(v ?? 0);
    }
  }
  async setConversation(id: string, conversationId: string) {
    this.rows.get(id)!.conversationId = conversationId;
  }
  async end(id: string, reason: string, at: Date) {
    const row = this.rows.get(id);
    if (row?.status !== 'open') return false;
    Object.assign(row, { status: 'ended', endReason: reason, endedAt: at });
    return true;
  }
  async expireStale(now: Date) {
    let n = 0;
    for (const row of this.rows.values()) {
      if (row.status === 'open' && row.expiresAt <= now) {
        Object.assign(row, { status: 'ended', endReason: 'expired' });
        n++;
      }
    }
    return n;
  }
}

class MemoryVoiceAccess implements IAiVoiceAccess {
  readonly overrides = new Map<
    string,
    { role: string; permissions: Record<string, string> | null; isOwner: boolean } | null
  >();
  async accessFor(actorUserId: string, shopId: string) {
    const key = `${actorUserId}:${shopId}`;
    if (this.overrides.has(key)) return this.overrides.get(key)!;
    return actorUserId === shopId ? { role: 'owner', permissions: null, isOwner: true } : null;
  }
}

function voiceAssistant() {
  const a = assistant();
  const config = new AiConfig();
  const repo = new MemoryVoiceSessions();
  const access = new MemoryVoiceAccess();
  const sessions = new AiVoiceSessionsService(config, repo, a.preferences, a.audit);
  const voice = new AiVoiceConversationService(
    config,
    sessions,
    a.orchestrator,
    a.actionsService,
    a.actions,
    a.preferences,
    access,
    a.audit,
    silentLogger as never,
  );
  return { ...a, config, repo, access, sessions, voice };
}

async function openSession(v: ReturnType<typeof voiceAssistant>, actor = owner()) {
  const grant = await v.sessions.start(actor, {});
  const claims = verifyVoiceTicket(grant.ticket, SECRET, Date.now(), { forConnect: true })!;
  return { grant, claims };
}

let n = 0;
const turnId = () => `utt-${Date.now()}-${n++}`;

describe('voice tickets', () => {
  const claims = {
    v: 1 as const,
    sid: randomUUID(),
    shop: SHOP,
    act: SHOP,
    cexp: Date.now() + 120_000,
    sexp: Date.now() + 900_000,
  };

  it('verifies a genuine ticket and refuses a tampered one or another secret', () => {
    const ticket = signVoiceTicket(claims, SECRET);
    assert.deepEqual(verifyVoiceTicket(ticket, SECRET, Date.now(), { forConnect: true }), claims);
    const [v, payload, sig] = ticket.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, shop: OTHER_SHOP })).toString('base64url');
    assert.equal(verifyVoiceTicket(`${v}.${forged}.${sig}`, SECRET), null, 'another shop cannot be swapped in');
    assert.equal(verifyVoiceTicket(`${v}.${payload}.${sig}`, 'x'.repeat(48)), null);
    assert.equal(verifyVoiceTicket('nonsense', SECRET), null);
  });

  it('connecting needs the 2-minute window; turns only need the session to be live', () => {
    const late = signVoiceTicket({ ...claims, cexp: Date.now() - 1 }, SECRET);
    assert.equal(verifyVoiceTicket(late, SECRET, Date.now(), { forConnect: true }), null);
    assert.ok(verifyVoiceTicket(late, SECRET));
    const ended = signVoiceTicket({ ...claims, sexp: Date.now() - 1 }, SECRET);
    assert.equal(verifyVoiceTicket(ended, SECRET), null);
  });

  it('the gateway guard needs the gateway key AND a valid ticket', () => {
    const guard = new AiVoiceGatewayGuard(new AiConfig());
    const ctx = (headers: Record<string, string>) => {
      const request = { header: (h: string) => headers[h], voice: undefined as unknown };
      return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } as never };
    };
    const ticket = signVoiceTicket(claims, SECRET);
    assert.throws(() => guard.canActivate(ctx({ 'x-voice-gateway-key': 'wrong', 'x-voice-ticket': ticket }).context));
    assert.throws(() =>
      guard.canActivate(ctx({ 'x-voice-gateway-key': 'k'.repeat(48), 'x-voice-ticket': 'bad' }).context),
    );
    const ok = ctx({ 'x-voice-gateway-key': 'k'.repeat(48), 'x-voice-ticket': ticket });
    assert.equal(guard.canActivate(ok.context), true);
    assert.deepEqual(ok.request.voice, claims);
  });
});

describe('voice sessions and limits', () => {
  it('a session is for the signed-in person in their shop, with a short connect ticket', async () => {
    const v = voiceAssistant();
    const { grant, claims } = await openSession(v);
    assert.equal(grant.url, 'wss://voice.test/v1/connect');
    assert.equal(grant.protocol, 'bb.voice.v1');
    assert.deepEqual([claims.shop, claims.act], [SHOP, SHOP]);
    assert.ok(claims.cexp - Date.now() <= 120_000);
    assert.ok(v.audit.events().includes('VOICE_SESSION_STARTED'));
  });

  it('a third session of the same person replaces the oldest; a full shop gets 429', async () => {
    const v = voiceAssistant();
    const first = await v.sessions.start(owner(), {});
    await v.sessions.start(owner(), {});
    await v.sessions.start(owner(), {});
    assert.equal(v.repo.rows.get(first.sessionId)!.endReason, 'replaced');
    assert.equal((await v.repo.listOpen({ actorUserId: SHOP }, new Date())).length, 2);

    for (let i = 0; i < 3; i++) {
      const member = { ...staff(), actorUserId: randomUUID() };
      await v.sessions.start(member, {});
    }
    await assert.rejects(v.sessions.start({ ...staff(), actorUserId: randomUUID() }, {}), (e) => statusOf(e) === 429);
  });

  it("stops at the day's minutes: no new session, no more spoken turns (typing still works)", async () => {
    const v = voiceAssistant();
    const { grant, claims } = await openSession(v);
    await v.repo.addUsage(grant.sessionId, { audioMs: 30 * 60_000 });
    await assert.rejects(v.sessions.start(owner(), {}), (e) => codeOf(e) === 'AI_VOICE_DAILY_LIMIT');
    await assert.rejects(
      v.voice.turn(claims, { utteranceId: turnId(), kind: 'speech', text: 'stock summary', audioMs: 2000 }),
      (e) => statusOf(e) === 429,
    );
    assert.ok(v.audit.events().includes('VOICE_TURN_REFUSED'));
    v.model.script(say('Typed answer.'));
    const typed = await v.voice.turn(claims, { utteranceId: turnId(), kind: 'text', text: 'stock summary' });
    assert.equal(typed.response.message.text, 'Typed answer.');
  });
});

describe('spoken turns through the existing assistant', () => {
  it('"Ek payal add karo, paanch gram aur sattar percent purity" → the same inventory preview as typing', async () => {
    const v = voiceAssistant();
    const { claims } = await openSession(v);
    v.model.script((request) => {
      const flat = JSON.stringify(request.messages);
      assert.ok(flat.includes('5 gram aur 70% purity'), 'the model gets the cleaned-up text');
      assert.ok(flat.includes('Channel: voice'), 'and knows it was spoken');
      return callTool('inventory_create', { itemName: 'Payal', metalType: 'SILVER', grossWeight: 5, purity: '70%' })(
        request,
        0,
      );
    }, say('Preview ready: Silver Payal, 5 g, 70%. Say confirm or tap Confirm.'));
    const result = await v.voice.turn(claims, {
      utteranceId: turnId(),
      kind: 'speech',
      text: 'Ek payal add karo, paanch gram aur sattar percent purity',
      language: 'hi',
      confidence: 0.82,
      audioMs: 4200,
      sttRequests: 1,
    });
    assert.equal(result.handledBy, 'assistant');
    assert.equal(result.transcript?.original, 'Ek payal add karo, paanch gram aur sattar percent purity');
    assert.equal(result.transcript?.text, 'Ek payal add karo, 5 gram aur 70% purity');
    const [action] = result.response.actions;
    assert.equal(action.action, 'inventory.create');
    assert.equal(action.status, 'AWAITING_CONFIRMATION');
    assert.equal(v.inventory.calls.filter((c) => c.method === 'create').length, 0, 'nothing saved yet');
    assert.equal(result.speak.speak, true);
    assert.match(result.speak.text, /5 grams, 70 percent/);
    // The original transcript is kept with the message for audit, not sent to the model.
    const stored = v.messages.rows.find((m) => m.role === 'user')!;
    assert.ok(stored.content.some((b) => b.type === 'transcript'));
    assert.equal(v.repo.rows.get(claims.sid)!.audioMs, 4200);
  });

  it('voice and text share one conversation (both directions)', async () => {
    const v = voiceAssistant();
    const { claims } = await openSession(v);
    v.model.script(say('Which metal?'));
    const spoken = await v.voice.turn(claims, { utteranceId: turnId(), kind: 'speech', text: 'ek payal add karo' });

    v.model.script((request) => {
      assert.ok(JSON.stringify(request.messages).includes('ek payal add karo'), 'typed turn sees the spoken one');
      return say('Okay, silver.')(request, 0);
    });
    await v.orchestrator.chat(owner(), { message: 'chandi', conversationId: spoken.conversationId });

    v.model.script((request) => {
      assert.ok(JSON.stringify(request.messages).includes('chandi'), 'spoken turn sees the typed one');
      return say('Weight?')(request, 0);
    });
    const again = await v.voice.turn(claims, {
      utteranceId: turnId(),
      kind: 'speech',
      text: 'paanch gram',
      conversationId: spoken.conversationId,
    });
    assert.equal(again.conversationId, spoken.conversationId);
  });

  it('a repeated utterance (same id) returns the first answer: nothing runs twice', async () => {
    const v = voiceAssistant();
    const { claims } = await openSession(v);
    const id = turnId();
    v.model.script(say('One.'));
    const first = await v.voice.turn(claims, { utteranceId: id, kind: 'speech', text: 'stock summary' });
    const second = await v.voice.turn(claims, {
      utteranceId: id,
      kind: 'speech',
      text: 'stock summary',
      conversationId: first.conversationId,
    });
    assert.equal(second.response.replayed, true);
    assert.equal(v.model.requests.length, 1);
  });

  it('traditional units are flagged and the model is told to ask, never to convert', async () => {
    const v = voiceAssistant();
    const { claims } = await openSession(v);
    v.model.script((request) => {
      assert.match(JSON.stringify(request.messages), /Traditional units said: aana/);
      return say('Kitne gram?')(request, 0);
    });
    const result = await v.voice.turn(claims, {
      utteranceId: turnId(),
      kind: 'speech',
      text: 'do aana ki bali add karo',
    });
    assert.equal(result.transcript?.text, '2 aana ki bali add karo');
    assert.deepEqual(result.transcript?.flags, ['unit:aana']);
  });
});

describe('spoken confirm and cancel', () => {
  async function withPreview(v: ReturnType<typeof voiceAssistant>, claims: ReturnType<typeof verifyVoiceTicket>) {
    v.model.script(
      callTool('inventory_create', { itemName: 'Payal', metalType: 'SILVER', grossWeight: 5, purity: '70%' }),
      say('Preview ready.'),
    );
    return v.voice.turn(claims!, { utteranceId: turnId(), kind: 'speech', text: 'payal 5 gram 70%' });
  }

  it('"confirm" saves the single open stock preview, logged as a voice action', async () => {
    const v = voiceAssistant();
    const { claims } = await openSession(v);
    const preview = await withPreview(v, claims);
    const result = await v.voice.turn(claims, {
      utteranceId: turnId(),
      kind: 'speech',
      text: 'haan confirm karo',
      conversationId: preview.conversationId,
    });
    assert.equal(result.handledBy, 'voice_confirm');
    assert.equal(result.response.actions[0].status, 'COMPLETED');
    assert.equal(v.inventory.calls.filter((c) => c.method === 'create').length, 1);
    assert.equal(v.activity.rows[0].channel, 'voice');
    assert.equal(v.model.requests.length, 2, 'no model call for the spoken decision');
  });

  it('a bare "haan" is not a confirmation (goes to the assistant)', async () => {
    const v = voiceAssistant();
    const { claims } = await openSession(v);
    const preview = await withPreview(v, claims);
    v.model.script(say('Please say confirm or tap Confirm.'));
    const result = await v.voice.turn(claims, {
      utteranceId: turnId(),
      kind: 'speech',
      text: 'haan',
      conversationId: preview.conversationId,
    });
    assert.equal(result.handledBy, 'assistant');
    assert.equal(v.inventory.calls.filter((c) => c.method === 'create').length, 0);
  });

  it('money previews are never saved by voice; cancelling by voice always works', async () => {
    const v = voiceAssistant();
    const { claims } = await openSession(v);
    const customer = v.customers.add(SHOP, { firstName: 'Ramesh', lastName: 'Kumar' });
    v.loans.add(SHOP, { customerId: customer.id, customerName: 'Ramesh Kumar' });
    v.model.script(
      callTool('payments_record', { customer: 'Ramesh Kumar', amount: 400, paymentType: 'INTEREST', paidIn: 'CASH' }),
      say('Preview ready.'),
    );
    const preview = await v.voice.turn(claims, {
      utteranceId: turnId(),
      kind: 'speech',
      text: 'Ramesh ne 400 byaj diya cash',
    });
    const spoken = await v.voice.turn(claims, {
      utteranceId: turnId(),
      kind: 'speech',
      text: 'confirm',
      conversationId: preview.conversationId,
    });
    assert.equal(spoken.handledBy, 'voice_needs_tap');
    assert.equal(v.loans.recorded.length, 0, 'no payment from a spoken confirm');

    const cancel = await v.voice.turn(claims, {
      utteranceId: turnId(),
      kind: 'speech',
      text: 'cancel karo',
      conversationId: preview.conversationId,
    });
    assert.equal(cancel.handledBy, 'voice_cancel');
    assert.equal(cancel.response.actions[0].status, 'CANCELLED');
  });
});

describe('voice tenant isolation', () => {
  it('a ticket cannot be used for another session, shop or person', async () => {
    const v = voiceAssistant();
    const { claims } = await openSession(v);
    await assert.rejects(
      v.voice.turn({ ...claims, shop: OTHER_SHOP }, { utteranceId: turnId(), kind: 'text', text: 'hi' }),
      (e) => statusOf(e) === 401,
    );
    await assert.rejects(
      v.voice.turn({ ...claims, sid: randomUUID() }, { utteranceId: turnId(), kind: 'text', text: 'hi' }),
      (e) => statusOf(e) === 401,
    );
  });

  it("another person's conversation id is not found", async () => {
    const v = voiceAssistant();
    v.model.script(say('Owner chat.'));
    const ownerChat = await v.orchestrator.chat(owner(), { message: 'hello' });
    const member = { ...staff(), actorUserId: randomUUID() };
    v.access.overrides.set(`${member.actorUserId}:${SHOP}`, {
      role: 'staff',
      permissions: staff().permissions,
      isOwner: false,
    });
    const { claims } = await openSession(v, member);
    await assert.rejects(
      v.voice.turn(claims, {
        utteranceId: turnId(),
        kind: 'text',
        text: 'show it',
        conversationId: ownerChat.conversationId,
      }),
      (e) => statusOf(e) === 404,
    );
  });

  it('a member removed mid-session loses voice at the next turn', async () => {
    const v = voiceAssistant();
    const member = { ...staff(), actorUserId: randomUUID() };
    v.access.overrides.set(`${member.actorUserId}:${SHOP}`, {
      role: 'staff',
      permissions: staff().permissions,
      isOwner: false,
    });
    const { claims } = await openSession(v, member);
    v.access.overrides.set(`${member.actorUserId}:${SHOP}`, null);
    await assert.rejects(
      v.voice.turn(claims, { utteranceId: turnId(), kind: 'speech', text: 'stock summary' }),
      (e) => statusOf(e) === 403,
    );
    assert.equal(v.repo.rows.get(claims.sid)!.endReason, 'access_removed');
  });
});

describe('transcript clean-up', () => {
  const t = (s: string) => normalizeTranscript(s).text;
  it('numbers next to a unit or an amount word become digits; units are never converted', () => {
    assert.equal(t('paanch gram'), '5 gram');
    assert.equal(t('sattar percent purity'), '70% purity');
    assert.equal(t('pandrah hazaar ka loan'), '15000 ka loan');
    assert.equal(t('dedh lakh'), '150000');
    assert.equal(t('saadhe paanch gram'), '5.5 gram');
    assert.equal(t('pandrah hazaar paanch sau rupaye'), '15500 rupaye');
    assert.equal(t('do aana'), '2 aana');
    assert.equal(t('sawa tola'), '1.25 tola');
    assert.equal(t('पांच ग्राम'), '5 ग्राम');
    assert.equal(t('५ ग्राम'), '5 ग्राम');
  });
  it('leaves number words that are not quantities, and fixes jewellery spellings', () => {
    assert.equal(t('ek payal add karo'), 'ek payal add karo');
    assert.equal(t('mujhe do'), 'mujhe do');
    assert.equal(t('garam chai'), 'garam chai');
    assert.equal(t('payel 70 touch'), 'payal 70 tunch');
    assert.equal(t('girwi ka udhar'), 'girvi ka udhaar');
  });
  it('flags traditional units and keeps the original', () => {
    const r = normalizeTranscript('teen ratti aur do aana');
    assert.deepEqual(r.flags.sort(), ['unit:aana', 'unit:ratti']);
    assert.equal(r.original, 'teen ratti aur do aana');
    assert.ok(r.changes.length >= 2);
  });
});

describe('what is read aloud', () => {
  it('English replies are spoken; Hindi, Gujarati and Hinglish are shown as text', () => {
    assert.equal(isEnglishForSpeech('Preview ready: Silver Payal, 5 g. Tap Confirm to save.'), true);
    assert.equal(isEnglishForSpeech('Payal ka weight aur purity batayein?'), false);
    assert.equal(isEnglishForSpeech('पायल का वज़न बताइए'), false);
    assert.equal(isEnglishForSpeech('પાયલનું વજન'), false);
    assert.deepEqual(speechFor('Kitne gram hai?', { speakReplies: true, maxChars: 400 }), {
      speak: false,
      text: '',
      reason: 'not_english',
    });
    assert.equal(speechFor('Saved.', { speakReplies: false, maxChars: 400 }).reason, 'muted');
  });
  it('symbols become words and long replies stop at a sentence', () => {
    assert.equal(
      toSpeakableText('Loan of ₹15,000 at 2% for 22K gold, 5g.', 400),
      'Loan of 15,000 rupees at 2 percent for 22 karat gold, 5 grams.',
    );
    const long = toSpeakableText('First sentence here. Second sentence is longer than the cap allows.', 30);
    assert.equal(long, 'First sentence here.');
  });
});

describe('spoken intents', () => {
  it('needs an explicit word; negation cancels; long sentences are not commands', () => {
    assert.equal(voiceIntentOf('confirm'), 'confirm');
    assert.equal(voiceIntentOf('Haan, save kar do.'), 'confirm');
    assert.equal(voiceIntentOf('हाँ कन्फर्म करो'), 'confirm');
    assert.equal(voiceIntentOf('save mat karo'), 'cancel');
    assert.equal(voiceIntentOf('rehne do'), 'cancel');
    assert.equal(voiceIntentOf('haan'), null);
    assert.equal(voiceIntentOf('please confirm the price of the gold ring I bought yesterday'), null);
  });
});
