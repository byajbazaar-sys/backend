import { createHash } from 'crypto';

/**
 * Splits a document into chunks of at most `maxChars`, on paragraph and line boundaries first, then sentences, then
 * hard cuts — so a chunk is a few related lines, small enough to embed and to show the model.
 */
export function chunkText(text: string, maxChars = 700): string[] {
  const pieces = text
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => (line.length <= maxChars ? [line] : splitLong(line, maxChars)));
  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + 1 + piece.length > maxChars) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitLong(line: string, maxChars: number): string[] {
  const sentences = line.match(/[^.!?।]+[.!?।]*\s*/g) ?? [line];
  const out: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) out.push(current.trim());
      current = '';
      for (let i = 0; i < sentence.length; i += maxChars) out.push(sentence.slice(i, i + maxChars).trim());
      continue;
    }
    if (current.length + sentence.length > maxChars) {
      out.push(current.trim());
      current = sentence;
    } else current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

/** Stable point id (uuid shape) for a chunk: re-indexing the same document overwrites the same points. */
export function knowledgePointId(collection: string, docKey: string, chunkIndex: number): string {
  const hex = createHash('sha256').update(`${collection}\u0000${docKey}\u0000${chunkIndex}`).digest('hex');
  // Version 5-style layout (name-based), so it is a valid RFC 4122 uuid.
  const variant = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const contentHash = (text: string): string => createHash('sha256').update(text).digest('hex');
