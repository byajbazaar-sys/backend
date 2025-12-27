import { Types } from 'mongoose';

export function validateObjectIds(input: string | string[]): boolean {
  if (Array.isArray(input)) {
    return input.every((id) => Types.ObjectId.isValid(id));
  }
  return Types.ObjectId.isValid(input);
}
