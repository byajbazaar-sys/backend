import type { z } from 'zod';

type Path = PropertyKey[];

/**
 * Parses a tool call's input with the tool's strict schema, first as sent and then — only if that fails — after
 * fixing formatting slips smaller models make: a number sent as a string ("5", "1,250"), "true" / "false" for a
 * boolean, an optional field sent as null or "", an enum value in the wrong case ("silver" for SILVER). Values are
 * never invented and unknown keys (shopId, createdBy …) are never dropped, so the schema still refuses anything the
 * model may not send. Saves a model round trip per slip.
 */
export function parseToolInput<T>(schema: z.ZodType<T>, input: unknown): z.ZodSafeParseResult<T> {
  let parsed = schema.safeParse(input);
  if (parsed.success || !input || typeof input !== 'object') return parsed;
  const draft = structuredClone(input) as Record<string, unknown>;
  for (let pass = 0; pass < 2 && !parsed.success; pass++) {
    let changed = false;
    for (const issue of parsed.error.issues) changed = repair(draft, issue) || changed;
    if (!changed) break;
    parsed = schema.safeParse(draft);
  }
  return parsed;
}

function repair(root: Record<string, unknown>, issue: z.core.$ZodIssue): boolean {
  const path = issue.path;
  if (!path.length) return false;
  const parent = get(root, path.slice(0, -1));
  if (!parent || typeof parent !== 'object') return false;
  const key = path[path.length - 1] as string;
  const container = parent as Record<string, unknown>;
  const value = container[key];

  if (issue.code === 'invalid_type') {
    if (value === null) {
      delete container[key];
      return true;
    }
    if (issue.expected === 'number' && typeof value === 'string') {
      const n = Number(value.replace(/,/g, '').trim());
      if (value.trim() && Number.isFinite(n)) {
        container[key] = n;
        return true;
      }
    }
    if (issue.expected === 'boolean' && (value === 'true' || value === 'false')) {
      container[key] = value === 'true';
      return true;
    }
    return false;
  }
  if (issue.code === 'too_small' && issue.origin === 'string' && typeof value === 'string' && !value.trim()) {
    delete container[key];
    return true;
  }
  if (issue.code === 'invalid_value' && typeof value === 'string') {
    const wanted = value.trim().toLowerCase();
    const match = issue.values.find((v) => typeof v === 'string' && v.toLowerCase() === wanted);
    if (match !== undefined && match !== value) {
      container[key] = match;
      return true;
    }
  }
  return false;
}

function get(root: unknown, path: Path): unknown {
  let node = root;
  for (const key of path) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<PropertyKey, unknown>)[key];
  }
  return node;
}
