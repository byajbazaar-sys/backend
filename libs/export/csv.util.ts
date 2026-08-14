import * as Papa from 'papaparse';

/**
 * Flattens nested objects for CSV export (e.g. customer.firstName -> customer_firstName)
 */
function flattenForCsv(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}_${k}` : k;
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      Object.assign(result, flattenForCsv(v as Record<string, unknown>, key));
    } else {
      result[key] = v instanceof Date ? v.toISOString() : String(v ?? '');
    }
  }
  return result;
}

/**
 * Converts an array of objects to CSV string using papaparse
 */
export function toCSV<T extends Record<string, unknown>>(items: T[]): string {
  if (items.length === 0) return '';
  const flattened = items.map((item) => flattenForCsv(item as Record<string, unknown>));
  return Papa.unparse(flattened);
}
