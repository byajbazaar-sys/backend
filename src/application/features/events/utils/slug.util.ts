/** Build a URL-safe unique-ish slug from event identity fields. */
export function buildEventSlug(parts: { name?: string; city?: string; startDate?: string | Date }): string {
  const year = parts.startDate != null ? String(new Date(parts.startDate).getFullYear() || '') : '';
  const raw = [parts.name, parts.city, year].filter(Boolean).join(' ');
  const slug = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `event-${Date.now()}`;
}
