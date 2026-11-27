import type { z } from 'zod';

import type { AiAccessLevel, AiActionPreview, AiActor, AiCard, EAiIntent } from '../domain';

/** Everything a tool may know about the request — resolved on the server, never from the model. */
export interface AiToolContext {
  actor: AiActor;
  conversationId: string;
  now: Date;
}

export interface AiToolPermission {
  /** Shop module (customers, loans, inventory, billing, reports …); null = any member. */
  module: string | null;
  level: AiAccessLevel;
}

/** What a tool call produced, before it is turned into a tool result for the model. */
export type AiToolOutcome =
  /** Read tools: the data (minimised) and, optionally, a card for the app. */
  | { kind: 'result'; data: unknown; card?: AiCard }
  /** Required details are missing: the model asks the person instead of guessing. */
  | { kind: 'needs_input'; missing: { field: string; question: string }[]; known: Record<string, unknown> }
  /** More than one record matches: the model asks which one. */
  | { kind: 'ambiguous'; message: string; candidates: unknown[]; card?: AiCard }
  /** Write tools: a complete, validated payload and what it will do. Nothing is saved until confirmed. */
  | { kind: 'proposal'; parameters: Record<string, unknown>; preview: AiActionPreview }
  /** The request can't be done (e.g. nothing to change). */
  | { kind: 'rejected'; message: string };

export interface AiToolExecution {
  /** One line for the person ("Saved Silver Payal, SKU AB-0012"). */
  summary: string;
  data?: Record<string, unknown>;
  card?: AiCard;
  /** For the audit / activity log. */
  entityType: string;
  entityId?: string | null;
}

interface AiToolBase<TInput> {
  /** Unique action id, e.g. `inventory.create` (sent to the model as `inventory_create`). */
  action: string;
  intent: EAiIntent;
  /** For the model: when to use it and what it needs. */
  description: string;
  /** What the model may send. Strict: unknown keys (shop ids, user ids, roles …) are rejected. */
  input: z.ZodType<TInput>;
  /** Shape of the data a run / execution returns (checked before it is used). */
  output: z.ZodType;
  permission: AiToolPermission;
  /** Audit requirement: reads are audited (ids and counts only) when true; writes are always audited. */
  auditReads?: boolean;
  /** False hides the tool (e.g. knowledge search without Qdrant). */
  available?(): boolean;
}

/** Runs straight away (reads). */
export interface AiReadTool<TInput = unknown> extends AiToolBase<TInput> {
  confirmation: 'never';
  run(input: TInput, ctx: AiToolContext): Promise<AiToolOutcome>;
}

/** Prepares a preview; runs only after the person confirms that exact payload. */
export interface AiWriteTool<TInput = unknown, TParams = Record<string, unknown>> extends AiToolBase<TInput> {
  confirmation: 'required';
  /** The stored payload, validated again just before execution. */
  parameters: z.ZodType<TParams>;
  prepare(input: TInput, ctx: AiToolContext): Promise<AiToolOutcome>;
  execute(parameters: TParams, ctx: AiToolContext): Promise<AiToolExecution>;
}

export type AiTool = AiReadTool | AiWriteTool;

export const isWriteTool = (tool: AiTool): tool is AiWriteTool => tool.confirmation === 'required';
