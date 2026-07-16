/** Treat blank multipart/form-data strings as omitted optional fields. */
export function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
}
