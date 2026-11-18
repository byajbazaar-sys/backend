/**
 * Rows of a raw `query()`. On Postgres, TypeORM returns `[rows, affectedCount]` for UPDATE / DELETE (also with
 * `RETURNING` or a leading CTE) and plain `rows` for everything else; this accepts both.
 */
export function returnedRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as Record<string, unknown>[];
  return (Array.isArray(result) ? result : []) as Record<string, unknown>[];
}
