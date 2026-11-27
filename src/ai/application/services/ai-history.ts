import { AiMessage, AiStoredBlock } from '../domain';
import { AiModelBlock, AiModelMessage } from '../ports';

/** Stored blocks → model blocks (context blocks become plain text; nothing provider-specific is stored). */
export function storedToModelBlocks(blocks: AiStoredBlock[]): AiModelBlock[] {
  const out: AiModelBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'text' || block.type === 'context') {
      if (block.text.trim()) out.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_call') {
      out.push({ type: 'tool_call', id: block.id, name: block.name, input: block.input });
    } else if (block.type === 'tool_result') {
      out.push({ type: 'tool_result', toolCallId: block.toolCallId, content: block.content, isError: block.isError });
    }
  }
  return out;
}

/** Model blocks → what is stored: provider-specific (opaque) blocks are dropped. */
export function modelToStoredBlocks(blocks: AiModelBlock[]): AiStoredBlock[] {
  const out: AiStoredBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      if (block.text.trim()) out.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_call') {
      out.push({ type: 'tool_call', id: block.id, name: block.name, input: block.input });
    } else if (block.type === 'tool_result') {
      out.push({ type: 'tool_result', toolCallId: block.toolCallId, content: block.content, isError: block.isError });
    }
  }
  return out;
}

const roleOf = (message: AiMessage): 'user' | 'assistant' => (message.role === 'assistant' ? 'assistant' : 'user');

/**
 * Rebuilds the history the model gets from stored messages, append-only and always well formed: starts with a user
 * turn, alternates roles (consecutive messages of one role are merged, tool results first), every tool call is
 * followed by its result (a call whose result never got stored — a crashed request — gets an "it did not run"
 * result) and stray results are dropped. App events (a confirmation) become user-side notes.
 */
export function buildModelHistory(stored: AiMessage[]): AiModelMessage[] {
  const raw: AiModelMessage[] = stored
    .map((message) => {
      if (message.role === 'event') {
        const text = message.content
          .filter((b): b is Extract<AiStoredBlock, { type: 'text' }> => b.type === 'text')
          .map((b) => b.text)
          .join('\n');
        return { role: 'user' as const, content: text ? [{ type: 'text' as const, text: `[App event] ${text}` }] : [] };
      }
      return { role: roleOf(message), content: storedToModelBlocks(message.content) };
    })
    .filter((message) => message.content.length > 0);

  // Merge consecutive messages of the same role.
  const merged: AiModelMessage[] = [];
  for (const message of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) last.content = [...last.content, ...message.content];
    else merged.push({ role: message.role, content: [...message.content] });
  }

  // Pair tool calls with results.
  const out: AiModelMessage[] = [];
  for (let i = 0; i < merged.length; i++) {
    const message = merged[i];
    if (message.role === 'assistant') {
      out.push(message);
      const callIds = message.content.filter((b) => b.type === 'tool_call').map((b) => (b as { id: string }).id);
      if (!callIds.length) continue;
      const next = merged[i + 1]?.role === 'user' ? merged[i + 1] : null;
      const results = (next?.content ?? []).filter(
        (b) => b.type === 'tool_result' && callIds.includes((b as { toolCallId: string }).toolCallId),
      );
      const have = new Set(results.map((b) => (b as { toolCallId: string }).toolCallId));
      const missing: AiModelBlock[] = callIds
        .filter((id) => !have.has(id))
        .map((id) => ({ type: 'tool_result', toolCallId: id, content: '{"status":"not_run"}', isError: true }));
      const rest = (next?.content ?? []).filter((b) => b.type !== 'tool_result');
      out.push({ role: 'user', content: [...results, ...missing, ...rest] });
      if (next) i++;
    } else {
      // A user message not right after tool calls: its tool results (if any) are orphans.
      const content = message.content.filter((b) => b.type !== 'tool_result');
      if (content.length) out.push({ role: 'user', content });
    }
  }

  // First message must be the user's; merge again in case a dropped message left two user turns adjacent.
  while (out.length && out[0].role !== 'user') out.shift();
  const final: AiModelMessage[] = [];
  for (const message of out) {
    const last = final[final.length - 1];
    if (last && last.role === message.role) {
      const content = [...last.content, ...message.content];
      last.content = [
        ...content.filter((b) => b.type === 'tool_result'),
        ...content.filter((b) => b.type !== 'tool_result'),
      ];
    } else final.push(message);
  }
  return final;
}

export const textOf = (blocks: AiModelBlock[]): string =>
  blocks
    .filter((b): b is Extract<AiModelBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n\n');
