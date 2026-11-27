import { Inject, Injectable } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CLOUDFLARE_ACCOUNT_POOL } from '../../../application';
import type { CloudflareAccountPool } from '../../../infrastructure/ai/services/cloudflare-account-pool.service';
import { AiConfig } from '../../ai.config';
import {
  AiGenerateRequest,
  AiGenerateResult,
  AiModelBlock,
  AiModelCapabilities,
  AiModelError,
  IAiLanguageModel,
} from '../../application';

/** One chat message in Workers AI's (OpenAI-style) chat format. */
export interface WorkersAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

export interface WorkersAiSettings {
  maxTokens: number;
  temperature: number;
}

interface RawToolCall {
  id?: string;
  name?: string;
  arguments?: unknown;
  parameters?: unknown;
  function?: { name?: string; arguments?: unknown };
}

/** `result` of POST /ai/run/{model}: new models answer OpenAI-style (`choices`), older ones `response` + `tool_calls`. */
export interface WorkersAiResult {
  response?: unknown;
  tool_calls?: RawToolCall[];
  choices?: { message?: { content?: unknown; tool_calls?: RawToolCall[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface WorkersAiEnvelope {
  success?: boolean;
  result?: WorkersAiResult;
  errors?: { message?: string }[];
}

/**
 * Neutral request → Workers AI chat body. Tool results become `tool` messages (before any text of the same user
 * message, as the history builder orders them); assistant tool calls carry their ids so results pair up. Provider
 * blocks of other providers (`opaque`) are dropped. Reasoning is switched off on Gemma 4 / Qwen 3: the assistant
 * mostly picks a tool and fills its fields, and thinking would spend output tokens (neurons) and seconds.
 */
export function toWorkersAiBody(
  model: string,
  request: AiGenerateRequest,
  settings: WorkersAiSettings,
): Record<string, unknown> {
  const messages: WorkersAiMessage[] = [{ role: 'system', content: request.system }];
  const toolNames = new Map<string, string>();
  for (const message of request.messages) {
    const texts: string[] = [];
    const calls: NonNullable<WorkersAiMessage['tool_calls']> = [];
    for (const block of message.content) {
      if (block.type === 'text') {
        if (block.text.trim()) texts.push(block.text);
      } else if (block.type === 'tool_call') {
        toolNames.set(block.id, block.name);
        calls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        });
      } else if (block.type === 'tool_result') {
        messages.push({
          role: 'tool',
          tool_call_id: block.toolCallId,
          name: toolNames.get(block.toolCallId),
          content: block.content,
        });
      }
    }
    if (message.role === 'assistant') {
      if (texts.length || calls.length) {
        messages.push({ role: 'assistant', content: texts.join('\n'), ...(calls.length ? { tool_calls: calls } : {}) });
      }
    } else if (texts.length) {
      messages.push({ role: 'user', content: texts.join('\n\n') });
    }
  }
  const body: Record<string, unknown> = {
    messages,
    max_tokens: settings.maxTokens,
    temperature: settings.temperature,
  };
  if (request.tools.length) {
    body.tools = request.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
  }
  if (/gemma-4|qwen3/i.test(model)) body.chat_template_kwargs = { enable_thinking: false };
  if (/gpt-oss/i.test(model)) body.reasoning_effort = 'low';
  return body;
}

/**
 * Workers AI result → neutral result. Tool calls come from `choices[0].message.tool_calls` or the older top-level
 * `tool_calls`; arguments may be a JSON string or an object. A model that writes the call as JSON text instead
 * (it happens with smaller models) is read as a call too, but only when the whole reply is that JSON and the name
 * is one of the tools offered — anything else stays text. Arguments that are not valid JSON are passed on as
 * `{ _unparsed }`, which the tool's strict schema refuses, so the model is told and can try again.
 */
export function fromWorkersAiResult(
  result: WorkersAiResult | undefined,
  model: string,
  latencyMs: number,
  toolNames: ReadonlySet<string>,
): AiGenerateResult {
  const choice = result?.choices?.[0];
  const rawText = stringOf(choice?.message?.content ?? result?.response);
  let text = stripReasoning(rawText);
  let rawCalls = choice?.message?.tool_calls ?? result?.tool_calls ?? [];
  if (!rawCalls.length && toolNames.size) {
    const fromText = toolCallsInText(text, toolNames);
    if (fromText) {
      rawCalls = fromText;
      text = '';
    }
  }
  const content: AiModelBlock[] = [];
  if (text.trim()) content.push({ type: 'text', text: text.trim() });
  for (const raw of rawCalls) {
    const name = raw.function?.name ?? raw.name;
    if (!name) continue;
    content.push({
      type: 'tool_call',
      id: raw.id?.trim() || `call_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      name,
      input: parseArguments(raw.function?.arguments ?? raw.arguments ?? raw.parameters),
    });
  }
  const hasCalls = content.some((b) => b.type === 'tool_call');
  return {
    content,
    stopReason: hasCalls ? 'tool_use' : choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
    model,
    latencyMs,
    usage: {
      inputTokens: result?.usage?.prompt_tokens ?? 0,
      outputTokens: result?.usage?.completion_tokens ?? 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  };
}

function stringOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

/** Some models still emit their reasoning inline. It is never shown to the person. */
function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '');
}

function parseArguments(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { _unparsed: value.slice(0, 500) };
  }
}

function toolCallsInText(text: string, toolNames: ReadonlySet<string>): RawToolCall[] | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^<tool_call>\s*/i, '')
    .replace(/\s*<\/tool_call>$/i, '')
    .trim();
  if (!/^[[{]/.test(stripped)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const calls: RawToolCall[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') return null;
    const raw = item as RawToolCall;
    const name = raw.function?.name ?? raw.name;
    if (!name || !toolNames.has(name)) return null;
    calls.push(raw);
  }
  return calls.length ? calls : null;
}

/** HTTP failure → model error. A spent daily allocation is its own kind: the person is told when it comes back. */
export function workersAiError(status: number | undefined, message: string): AiModelError {
  if (status === 429 && /neuron|daily free allocation|workers paid|quota/i.test(message)) {
    return new AiModelError("Today's Workers AI allocation is used up", 'quota', false);
  }
  if (status === 429) return new AiModelError('Model rate limit reached', 'rate_limit', true);
  if (status === 401 || status === 403) return new AiModelError('The Cloudflare token was rejected', 'auth', false);
  if (status === 408 || status === 504) return new AiModelError('The model took too long to answer', 'timeout', true);
  if (status && status >= 400 && status < 500) {
    return new AiModelError(`The model rejected the request: ${message.slice(0, 200)}`, 'bad_request', false);
  }
  return new AiModelError('The model service is unavailable', 'unavailable', true);
}

/**
 * The assistant's model: a Workers AI chat model with function calling, on ByajBazaar's Cloudflare account pool —
 * the same rotation, daily-quota cooldowns and call log as try-on, marketing and the inbox bot. Default Gemma 4 26B
 * A4B (Mixture of Experts, 4B active): tool calling, 256K context, the best Hindi / Hinglish of the free-plan models
 * in ByajBazaar's own checks, and about a tenth of the neurons of Llama 3.3 70B. When it fails (or a model rejects
 * the request) the fallback model (Llama 4 Scout) answers that call. Accounts rotate on quota, auth and server
 * errors, all inside the call's time limit.
 */
@Injectable()
export class ByajBazaarWorkersAiLanguageModel implements IAiLanguageModel {
  readonly provider = 'workers-ai';
  readonly capabilities: AiModelCapabilities = {
    toolCalling: true,
    strictTools: false,
    promptCaching: false,
    streaming: false,
  };

  constructor(
    private readonly config: AiConfig,
    @Inject(CLOUDFLARE_ACCOUNT_POOL) private readonly pool: CloudflareAccountPool,
    @InjectPinoLogger(ByajBazaarWorkersAiLanguageModel.name) private readonly logger: PinoLogger,
  ) {}

  get model(): string {
    return this.config.llm.model;
  }

  get configured(): boolean {
    return this.config.llm.enabled;
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    if (!this.configured) throw new AiModelError('The assistant model is turned off', 'not_configured', false);
    const deadline = Date.now() + Math.max(1_000, request.timeoutMs);
    const credentials = await this.credentials();
    const toolNames = new Set(request.tools.map((t) => t.name));
    const { model, fallbackModel, maxAttempts } = this.config.llm;
    const plan = credentials.slice(0, Math.max(1, maxAttempts)).map((credential) => ({ credential, model }));
    let lastError: AiModelError | null = null;

    for (let i = 0; i < plan.length; i++) {
      const remaining = deadline - Date.now();
      if (remaining < 1_500) break;
      const { credential, model: modelId } = plan[i];
      const started = Date.now();
      try {
        const result = await this.call(credential, modelId, request, remaining);
        this.pool.reportSuccess(credential, {
          operation: 'assistant',
          model: modelId,
          durationMs: Date.now() - started,
        });
        return fromWorkersAiResult(result, modelId, Date.now() - started, toolNames);
      } catch (err) {
        const mapped = err instanceof AiModelError ? err : toTransportError(err);
        lastError = mapped;
        this.pool.reportFailure(credential, {
          operation: 'assistant',
          model: modelId,
          durationMs: Date.now() - started,
          status: (err as { status?: number }).status,
          message: mapped.message,
          quota: mapped.kind === 'quota',
        });
        this.logger.warn({ kind: mapped.kind, model: modelId, attempt: i + 1 }, 'Assistant model call failed');
        // A model-level problem (bad request, server error) gets one go on the fallback model; account-level ones
        // (quota, token, rate limit) move to the next account with the same model.
        const modelProblem = mapped.kind === 'bad_request' || mapped.kind === 'unavailable';
        if (
          modelProblem &&
          fallbackModel &&
          modelId !== fallbackModel &&
          !plan.some((p) => p.model === fallbackModel)
        ) {
          plan.splice(i + 1, 0, { credential: credentials[(i + 1) % credentials.length], model: fallbackModel });
        }
      }
    }
    throw lastError ?? new AiModelError('The model took too long to answer', 'timeout', true);
  }

  private async credentials() {
    try {
      return await this.pool.credentials();
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (/not configured|no cloudflare account is enabled/i.test(message)) {
        throw new AiModelError('No Cloudflare account is set up for Workers AI', 'not_configured', false);
      }
      throw new AiModelError("Today's Workers AI allocation is used up", 'quota', false);
    }
  }

  private async call(
    credential: { accountId: string; apiToken: string },
    model: string,
    request: AiGenerateRequest,
    timeoutMs: number,
  ): Promise<WorkersAiResult | undefined> {
    const body = toWorkersAiBody(model, request, {
      maxTokens: this.config.llm.maxTokens,
      temperature: this.config.llm.temperature,
    });
    const res = await axios.post<WorkersAiEnvelope>(
      `https://api.cloudflare.com/client/v4/accounts/${credential.accountId.trim()}/ai/run/${model}`,
      body,
      {
        headers: { Authorization: `Bearer ${credential.apiToken}`, 'Content-Type': 'application/json' },
        timeout: timeoutMs,
        validateStatus: () => true,
      },
    );
    if (res.status < 200 || res.status >= 300 || res.data?.success === false) {
      const message = res.data?.errors?.[0]?.message || `Workers AI request failed (${res.status})`;
      const error = workersAiError(res.status, message);
      Object.assign(error, { status: res.status });
      throw error;
    }
    return res.data?.result;
  }
}

function toTransportError(err: unknown): AiModelError {
  if (err instanceof AxiosError && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')) {
    return new AiModelError('The model took too long to answer', 'timeout', true);
  }
  return new AiModelError('Could not reach the model service', 'unavailable', true);
}
