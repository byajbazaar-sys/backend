/** What the vision model sees on the product photo, in a few English words (the script model translates them). */
export interface ProductLook {
  design?: string;
  details?: string;
}

export const PRODUCT_LOOK_PROMPT =
  "This is a jeweller's product photo. Describe ONLY what you can clearly see on the jewellery itself, for an " +
  'advertisement. JSON only: {"design": "<at most 8 words: motifs, pattern, shape>", ' +
  '"details": "<at most 8 words: enamel colours, bells, beads, finish — or none>"}';

/** The model's answer as short, safe notes: no numbers, no stones or diamonds unless the item is one, ≤ 10 words. */
export function parseProductLook(reply: string, diamond: boolean): ProductLook {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return {};
  }
  const clean = (value: unknown): string | undefined => {
    const text = (typeof value === 'string' ? value : '')
      .replace(/[^A-Za-z ,-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || /^(none|n\/?a|no)$/i.test(text)) return undefined;
    if (!diamond && /stone|diamond|gem|ruby|emerald|sapphire|kundan|polki/i.test(text)) return undefined;
    return text.split(' ').slice(0, 10).join(' ');
  };
  return { design: clean(raw.design), details: clean(raw.details) };
}
