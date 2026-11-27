import { z } from 'zod';

import { AiTool } from './ai-tool';
import { AiActor, actorCan } from '../domain';
import { AiToolSpec } from '../ports';

/** `inventory.create` → `inventory_create` (provider tool names allow [a-zA-Z0-9_-] only). */
export const toolWireName = (action: string): string => action.replace(/[.-]/g, '_');

const ACTION_ID = /^[a-z]+(\.[a-z]+(-[a-z]+)*)+$/;

/**
 * JSON Schema for a tool input, as strict tool use accepts it: every object closed (additionalProperties: false)
 * and no numeric / length constraints (zod still enforces those when the call comes back).
 */
export function toolJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  return sanitize(raw) as Record<string, unknown>;
}

const DROP = new Set([
  '$schema',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
  'default',
]);
const FORMATS = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid']);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (DROP.has(key)) continue;
    if (key === 'format' && (typeof value !== 'string' || !FORMATS.has(value))) continue;
    out[key] = key === 'properties' ? mapValues(value as Record<string, unknown>, sanitize) : sanitize(value);
  }
  if (out.type === 'object') {
    out.additionalProperties = false;
    out.properties ??= {};
    out.required ??= [];
  }
  return out;
}

function mapValues(obj: Record<string, unknown>, fn: (v: unknown) => unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}

/**
 * Every business action the assistant can take. The model only ever sees the tools the person may use, and every
 * name it sends back is looked up here — an unknown name is never executed.
 */
export class AiToolRegistry {
  private readonly byAction = new Map<string, AiTool>();
  private readonly byWire = new Map<string, AiTool>();
  private readonly specs = new Map<string, AiToolSpec>();

  constructor(tools: AiTool[]) {
    for (const tool of tools) {
      if (!ACTION_ID.test(tool.action)) throw new Error(`Invalid AI action id: ${tool.action}`);
      const wire = toolWireName(tool.action);
      if (this.byAction.has(tool.action) || this.byWire.has(wire)) {
        throw new Error(`Duplicate AI action: ${tool.action}`);
      }
      this.byAction.set(tool.action, tool);
      this.byWire.set(wire, tool);
    }
  }

  get(action: string): AiTool | undefined {
    return this.byAction.get(action);
  }

  byWireName(name: string): AiTool | undefined {
    return typeof name === 'string' ? this.byWire.get(name) : undefined;
  }

  all(): AiTool[] {
    return [...this.byAction.values()];
  }

  /** The tools this person may use right now, in a stable order (keeps the provider's prompt cache warm). */
  forActor(actor: AiActor): AiTool[] {
    return this.all()
      .filter((tool) => tool.available?.() ?? true)
      .filter((tool) => !tool.permission.module || actorCan(actor, tool.permission.module, tool.permission.level))
      .sort((a, b) => a.action.localeCompare(b.action));
  }

  spec(tool: AiTool): AiToolSpec {
    let spec = this.specs.get(tool.action);
    if (!spec) {
      spec = {
        name: toolWireName(tool.action),
        description: tool.description,
        inputSchema: toolJsonSchema(tool.input),
      };
      this.specs.set(tool.action, spec);
    }
    return spec;
  }
}
