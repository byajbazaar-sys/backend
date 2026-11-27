/** The AI module's building blocks: provider mapping, schemas, history, hashing, chunking, Qdrant, adapters. */
import axios from 'axios';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SHOP } from './fakes';
import { AiConfig } from '../../src/ai/ai.config';
import {
  actionPayloadHash,
  AiBusinessError,
  AiMessage,
  AiModelError,
  canonicalJson,
} from '../../src/ai/application/domain';
import { chunkText, knowledgePointId } from '../../src/ai/application/knowledge/knowledge-chunks';
import { buildModelHistory } from '../../src/ai/application/services/ai-history';
import {
  inventoryCreateTool,
  normalizePurity,
  parseToolInput,
  toolJsonSchema,
  toolWireName,
} from '../../src/ai/application/tools';
import { ByajBazaarInventoryAdapter } from '../../src/ai/infrastructure/adapters/byajbazaar-inventory.adapter';
import {
  ByajBazaarWorkersAiLanguageModel,
  fromWorkersAiResult,
  toWorkersAiBody,
  WorkersAiMessage,
  workersAiError,
} from '../../src/ai/infrastructure/adapters/byajbazaar-workers-ai-model.adapter';
import { QdrantKnowledgeIndex, scopeFilter } from '../../src/ai/infrastructure/vector/qdrant-knowledge.index';
import { isPaywallExemptPath } from '../../src/application/features/payments/utils/payments.constants';
import { isActorScoped, accessRuleFor } from '../../src/application/features/shops/domain/shop-permissions';

describe('Workers AI model adapter', () => {
  const request = {
    system: 'SYSTEM',
    timeoutMs: 10_000,
    tools: [
      {
        name: 'inventory_create',
        description: 'd',
        inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      },
    ],
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'hi' },
          { type: 'text' as const, text: '   ' },
        ],
      },
      {
        role: 'assistant' as const,
        content: [
          { type: 'opaque' as const, provider: 'anthropic', raw: { type: 'thinking' } },
          { type: 'text' as const, text: 'Preparing' },
          { type: 'tool_call' as const, id: 't1', name: 'inventory_create', input: { a: 1 } },
        ],
      },
      {
        role: 'user' as const,
        content: [
          { type: 'tool_result' as const, toolCallId: 't1', content: '{"ok":true}', isError: false },
          { type: 'text' as const, text: 'and one more' },
        ],
      },
    ],
  };

  it('maps a request to a chat body: system first, tool calls with ids, tool results before text', () => {
    const body = toWorkersAiBody('@cf/google/gemma-4-26b-a4b-it', request, { maxTokens: 900, temperature: 0.2 });
    const messages = body.messages as WorkersAiMessage[];
    assert.deepEqual(
      messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'tool', 'user'],
    );
    assert.equal(messages[1].content, 'hi');
    assert.deepEqual(messages[2].tool_calls, [
      { id: 't1', type: 'function', function: { name: 'inventory_create', arguments: '{"a":1}' } },
    ]);
    assert.equal(messages[2].content, 'Preparing');
    assert.equal(messages[3].tool_call_id, 't1');
    assert.equal(messages[3].name, 'inventory_create');
    assert.deepEqual((body.tools as { function: { name: string } }[])[0].function.name, 'inventory_create');
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(body.max_tokens, 900);
  });

  it('omits tools when there are none, and thinking switches only for reasoning models', () => {
    const body = toWorkersAiBody(
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      { ...request, tools: [] },
      {
        maxTokens: 100,
        temperature: 0,
      },
    );
    assert.equal(body.tools, undefined);
    assert.equal(body.chat_template_kwargs, undefined);
  });

  const names = new Set(['inventory_create', 'inventory_search']);

  it('reads OpenAI-style answers: text, tool calls with string arguments, usage', () => {
    const result = fromWorkersAiResult(
      {
        choices: [
          {
            message: {
              content: 'Preparing',
              tool_calls: [{ id: 'c1', function: { name: 'inventory_search', arguments: '{"metalType":"SILVER"}' } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 9 },
      },
      'm',
      5,
      names,
    );
    assert.deepEqual(result.content, [
      { type: 'text', text: 'Preparing' },
      { type: 'tool_call', id: 'c1', name: 'inventory_search', input: { metalType: 'SILVER' } },
    ]);
    assert.equal(result.stopReason, 'tool_use');
    assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 9, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });

  it('reads the older shape (response + top-level tool_calls with object arguments) and makes up missing ids', () => {
    const result = fromWorkersAiResult(
      { response: null, tool_calls: [{ name: 'inventory_create', arguments: { itemName: 'Payal' } }] },
      'm',
      1,
      names,
    );
    const call = result.content[0] as { type: string; id: string; input: unknown };
    assert.equal(call.type, 'tool_call');
    assert.match(call.id, /^call_[a-f0-9]{24}$/);
    assert.deepEqual(call.input, { itemName: 'Payal' });
  });

  it('reads a tool call written as JSON text only when the whole reply is a call to an offered tool', () => {
    const asText = fromWorkersAiResult(
      { response: '```json\n{"name":"inventory_search","parameters":{"text":"payal"}}\n```' },
      'm',
      1,
      names,
    );
    assert.equal(asText.content.length, 1);
    assert.deepEqual((asText.content[0] as { input: unknown }).input, { text: 'payal' });

    const unknownTool = fromWorkersAiResult({ response: '{"name":"db_query","parameters":{}}' }, 'm', 1, names);
    assert.deepEqual(unknownTool.content, [{ type: 'text', text: '{"name":"db_query","parameters":{}}' }]);
    assert.equal(unknownTool.stopReason, 'end_turn');

    const prose = fromWorkersAiResult({ response: '<think>hmm</think>Payal is an anklet.' }, 'm', 1, names);
    assert.deepEqual(prose.content, [{ type: 'text', text: 'Payal is an anklet.' }]);
  });

  it("drops Gemma's leaked control tokens and thinking (the bare `<channel|>` reply seen in production)", () => {
    assert.deepEqual(fromWorkersAiResult({ response: '<channel|>' }, 'm', 1, names).content, []);
    const thought = fromWorkersAiResult({ response: 'The user wants stock<channel|>Here it is.' }, 'm', 1, names);
    assert.deepEqual(thought.content, [{ type: 'text', text: 'Here it is.' }]);
    const wrapped = fromWorkersAiResult(
      { choices: [{ message: { content: '<|channel>thought\nhmm<channel|>Namaste <end_of_turn>' } }] },
      'm',
      1,
      names,
    );
    assert.deepEqual(wrapped.content, [{ type: 'text', text: 'Namaste' }]);
    const plain = fromWorkersAiResult({ response: 'Use <b> only as text: 5 < 7 > 3' }, 'm', 1, names);
    assert.deepEqual(plain.content, [{ type: 'text', text: 'Use <b> only as text: 5 < 7 > 3' }]);
  });

  it('passes unreadable arguments on so the strict schema refuses them', () => {
    const result = fromWorkersAiResult(
      {
        choices: [
          { message: { tool_calls: [{ id: 'x', function: { name: 'inventory_create', arguments: '{oops' } }] } },
        ],
      },
      'm',
      1,
      names,
    );
    assert.deepEqual((result.content[0] as { input: unknown }).input, { _unparsed: '{oops' });
    const length = fromWorkersAiResult(
      { choices: [{ message: { content: 'abc' }, finish_reason: 'length' }] },
      'm',
      1,
      names,
    );
    assert.equal(length.stopReason, 'max_tokens');
  });

  it('maps HTTP failures: spent allocation, rate limit, token, bad request, server error', () => {
    assert.equal(
      workersAiError(429, '4006: you have used up your daily free allocation of 10,000 neurons').kind,
      'quota',
    );
    assert.equal(workersAiError(429, 'Too many requests').kind, 'rate_limit');
    assert.equal(workersAiError(403, 'Authentication error').kind, 'auth');
    assert.equal(workersAiError(400, 'bad input').kind, 'bad_request');
    assert.equal(workersAiError(500, 'oops').retryable, true);
  });

  it('rotates accounts on a spent allocation and falls back to the second model on a model error', async () => {
    const credentials = [
      { accountId: 'a1', apiToken: 't1', label: 'one' },
      { accountId: 'a2', apiToken: 't2', label: 'two' },
      { accountId: 'a3', apiToken: 't3', label: 'three' },
    ];
    const failures: { model: string; quota: boolean }[] = [];
    const pool = {
      credentials: () => Promise.resolve(credentials),
      reportSuccess: () => undefined,
      reportFailure: (_: unknown, info: { model: string; quota: boolean }) => failures.push(info),
    };
    const config = new AiConfig();
    const silent = { warn: () => undefined } as never;
    const model = new ByajBazaarWorkersAiLanguageModel(config, pool as never, silent);
    const seen: string[] = [];
    const originalPost = axios.post.bind(axios);
    const replies = [
      { status: 429, data: { success: false, errors: [{ message: 'daily free allocation used up' }] } },
      { status: 500, data: { success: false, errors: [{ message: 'internal' }] } },
      { status: 200, data: { success: true, result: { response: 'Namaste' } } },
    ];
    (axios as { post: unknown }).post = (url: string) => {
      seen.push(url);
      return Promise.resolve(replies.shift());
    };
    try {
      const result = await model.generate({ ...request, tools: [] });
      assert.deepEqual(result.content, [{ type: 'text', text: 'Namaste' }]);
      assert.equal(result.model, config.llm.fallbackModel);
      assert.deepEqual(
        failures.map((f) => [f.model, f.quota]),
        [
          [config.llm.model, true],
          [config.llm.model, false],
        ],
      );
      assert.match(seen[0], /accounts\/a1\/ai\/run\/@cf\/google\/gemma-4/);
      assert.match(seen[1], /accounts\/a2\//);
      assert.match(seen[2], /llama-4-scout/);
    } finally {
      (axios as { post: unknown }).post = originalPost;
    }
  });

  it('is a 503 when no Cloudflare account is set up and a quota error when all are resting', async () => {
    const silent = { warn: () => undefined } as never;
    const none = new ByajBazaarWorkersAiLanguageModel(
      new AiConfig(),
      { credentials: () => Promise.reject(new Error('Cloudflare Workers AI is not configured: add …')) } as never,
      silent,
    );
    await assert.rejects(none.generate(request), (err: AiModelError) => err.kind === 'not_configured');
    const resting = new ByajBazaarWorkersAiLanguageModel(
      new AiConfig(),
      { credentials: () => Promise.reject(new Error("All Cloudflare accounts have used today's free quota")) } as never,
      silent,
    );
    await assert.rejects(resting.generate(request), (err: AiModelError) => err.kind === 'quota');
  });
});

describe('tool input repair', () => {
  const tool = inventoryCreateTool({} as never);

  it('fixes numbers sent as text, null / empty optionals and enum case — nothing else', () => {
    const parsed = parseToolInput(tool.input, {
      itemName: 'Payal',
      metalType: 'silver',
      grossWeight: '5.5',
      sellingPrice: '1,250',
      purity: null,
      huid: '',
      hallmarked: 'true',
    });
    assert.ok(parsed.success, JSON.stringify(!parsed.success && parsed.error.issues));
    assert.deepEqual(parsed.data, {
      itemName: 'Payal',
      metalType: 'SILVER',
      grossWeight: 5.5,
      sellingPrice: 1250,
      hallmarked: true,
    });
  });

  it('still refuses unknown keys (tenant ids), unreadable numbers and missing required fields', () => {
    assert.equal(parseToolInput(tool.input, { itemName: 'Payal', shopId: 'other-shop' }).success, false);
    assert.equal(parseToolInput(tool.input, { itemName: 'Payal', grossWeight: 'five' }).success, false);
    assert.equal(parseToolInput(tool.input, { itemName: null }).success, false);
    assert.equal(parseToolInput(tool.input, { _unparsed: '{oops' }).success, false);
  });
});

describe('tool schemas', () => {
  it('sends strict-compatible JSON Schema: closed objects, no numeric / length constraints', () => {
    const schema = toolJsonSchema(inventoryCreateTool({} as never).input);
    const text = JSON.stringify(schema);
    assert.equal(schema.additionalProperties, false);
    assert.ok(!/"(minimum|maximum|exclusiveMinimum|minLength|maxLength|\$schema)"/.test(text), text);
    assert.deepEqual(schema.required, ['itemName']);
  });

  it('uses provider-safe wire names', () => {
    assert.equal(toolWireName('inventory.create'), 'inventory_create');
    assert.equal(toolWireName('reports.loan-summary'), 'reports_loan_summary');
  });
});

describe('history rebuilt for the model', () => {
  const msg = (turnIndex: number, seq: number, role: AiMessage['role'], content: AiMessage['content']): AiMessage => ({
    id: `${turnIndex}-${seq}`,
    conversationId: 'c',
    turnIndex,
    seq,
    role,
    content,
    createdAt: new Date(),
  });

  it('pairs a tool call whose result was never stored with a "not run" result, and drops orphans', () => {
    const history = buildModelHistory([
      msg(1, 0, 'user', [
        { type: 'text', text: 'add payal' },
        { type: 'context', text: '<app_context>…</app_context>' },
      ]),
      msg(1, 1, 'assistant', [{ type: 'tool_call', id: 't1', name: 'inventory_create', input: {} }]),
      // (crash: no tool result stored)
      msg(2, 0, 'user', [
        { type: 'tool_result', toolCallId: 'zz', content: '{}' },
        { type: 'text', text: 'hello?' },
      ]),
    ]);
    assert.deepEqual(
      history.map((m) => m.role),
      ['user', 'assistant', 'user'],
    );
    const last = history[2].content;
    assert.equal(last[0].type, 'tool_result');
    assert.equal((last[0] as { toolCallId: string }).toolCallId, 't1');
    assert.ok(!last.some((b) => b.type === 'tool_result' && (b as { toolCallId: string }).toolCallId === 'zz'));
  });

  it('turns app events into user-side notes and never starts with the assistant', () => {
    const history = buildModelHistory([
      msg(1, 1, 'assistant', [{ type: 'text', text: 'orphan reply' }]),
      msg(1, 2, 'event', [{ type: 'text', text: 'The person confirmed inventory.create' }]),
      msg(2, 0, 'user', [{ type: 'text', text: 'next' }]),
    ]);
    assert.equal(history[0].role, 'user');
    assert.match((history[0].content[0] as { text: string }).text, /^\[App event\]/);
    assert.equal(history.length, 1, 'consecutive user-side messages merge');
  });
});

describe('payload hashing', () => {
  it('is independent of key order and changes with any detail', () => {
    assert.equal(canonicalJson({ b: 1, a: { d: 2, c: [3, undefined] } }), '{"a":{"c":[3,null],"d":2},"b":1}');
    const base = {
      action: 'inventory.create',
      parameters: { itemName: 'Payal', grossWeight: 5 },
      shopId: SHOP,
      actorUserId: SHOP,
    };
    const same = actionPayloadHash({ ...base, parameters: { grossWeight: 5, itemName: 'Payal' } });
    assert.equal(actionPayloadHash(base), same);
    assert.notEqual(
      actionPayloadHash(base),
      actionPayloadHash({ ...base, parameters: { itemName: 'Payal', grossWeight: 6 } }),
    );
    assert.notEqual(actionPayloadHash(base), actionPayloadHash({ ...base, actorUserId: 'someone-else' }));
  });
});

describe('knowledge chunks', () => {
  it('splits on lines within the size, deterministic uuid point ids', () => {
    const chunks = chunkText(`${'a'.repeat(400)}\n${'b'.repeat(400)}\n${'c. '.repeat(400)}`, 500);
    assert.ok(chunks.length >= 3);
    assert.ok(chunks.every((c) => c.length <= 500));
    const id = knowledgePointId('bb_help_documents', 'doc', 0);
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(id, knowledgePointId('bb_help_documents', 'doc', 0));
    assert.notEqual(id, knowledgePointId('bb_help_documents', 'doc', 1));
  });
});

describe('purity', () => {
  it('normalises the common ways shops write it', () => {
    assert.equal(normalizePurity('22k'), '22K');
    assert.equal(normalizePurity('22 carat'), '22K');
    assert.equal(normalizePurity('70 %'), '70%');
    assert.equal(normalizePurity('80 tunch'), '80%');
    assert.equal(normalizePurity('916'), '916');
    assert.equal(normalizePurity('  '), undefined);
  });
});

describe('Qdrant knowledge index', () => {
  it('filters every search to shared knowledge and this shop, and drops anything else it gets back', async () => {
    const config = new AiConfig();
    (config.qdrant as { url: string }).url = 'http://qdrant.test';
    const index = new QdrantKnowledgeIndex(config, { warn: () => undefined } as never);
    const sent: unknown[] = [];
    (index as unknown as { http: unknown }).http = {
      post: async (_url: string, body: unknown) => {
        sent.push(body);
        return {
          status: 200,
          data: {
            result: [
              { id: 'a', score: 0.9, payload: { scope: 'global', title: 'Purity', text: 'ok' } },
              { id: 'b', score: 0.8, payload: { scope: 'another-shop', title: 'Secret', text: 'leak' } },
            ],
          },
        };
      },
    };
    const hits = await index.search(['bb_business_knowledge'], [0.1], { shopId: SHOP, limit: 5, minScore: 0.4 });
    assert.deepEqual(
      hits.map((h) => h.chunk.title),
      ['Purity'],
    );
    assert.deepEqual((sent[0] as { filter: unknown }).filter, scopeFilter(SHOP));
    assert.deepEqual(scopeFilter(SHOP), { must: [{ key: 'scope', match: { any: ['global', SHOP] } }] });
  });
});

describe('ByajBazaar inventory adapter', () => {
  it('applies the inventory API’s own validation before calling the service', async () => {
    const calls: unknown[] = [];
    const items = {
      create: async (dto: unknown, shopId: string) => (
        calls.push([dto, shopId]),
        { id: 'i', sku: 'S1', itemName: 'Payal', metalType: 'SILVER' }
      ),
    };
    const adapter = new ByajBazaarInventoryAdapter(items as never, {} as never, {} as never);
    await assert.rejects(
      adapter.create(SHOP, { itemName: 'Payal', metalType: 'TIN' }),
      (e) => e instanceof AiBusinessError && e.code === 'VALIDATION',
    );
    await assert.rejects(
      adapter.create(SHOP, { itemName: 'Payal', metalType: 'SILVER', stockQuantity: -1 }),
      AiBusinessError,
    );
    assert.equal(calls.length, 0);
    const item = await adapter.create(SHOP, {
      itemName: 'Payal',
      metalType: 'SILVER',
      grossWeight: 5,
      purity: '70%',
      stockQuantity: 1,
    });
    assert.equal(item.sku, 'S1');
    assert.equal((calls[0] as [unknown, string])[1], SHOP);
  });
});

describe('API classification of the assistant routes', () => {
  it('lets every member reach ai/*, keeps ai/admin personal, and keeps the paywall on chat', () => {
    assert.deepEqual(accessRuleFor('ai/chat', 'POST'), { kind: 'always' });
    assert.deepEqual(accessRuleFor('ai/actions/x/confirm', 'POST'), { kind: 'always' });
    assert.equal(isActorScoped('ai/admin/knowledge'), true);
    assert.equal(isActorScoped('ai/chat'), false);
    assert.equal(isPaywallExemptPath('/api/v1/ai/chat'), false);
  });
});
