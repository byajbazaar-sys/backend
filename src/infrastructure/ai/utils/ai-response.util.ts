export function extractJsonObject(text: string, label = 'AI'): string {
  if (!text) throw new Error(`Empty ${label} response`);
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`JSON incomplete in ${label} response`);
  }
  return cleaned.substring(start, end + 1);
}
