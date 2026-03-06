const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateObjectIds(input: string | string[]): boolean {
  if (Array.isArray(input)) {
    return input.every((id) => UUID_REGEX.test(id));
  }
  return UUID_REGEX.test(input);
}
