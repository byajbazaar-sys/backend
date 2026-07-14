export interface TrialUserFields {
  trialEndsAt?: Date | null;
  createdAt?: Date | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveTrialEndsAt(
  user: TrialUserFields,
  defaultTrialDays: number,
): Date | null {
  if (user.trialEndsAt) {
    return user.trialEndsAt instanceof Date ? user.trialEndsAt : new Date(user.trialEndsAt);
  }
  if (user.createdAt) {
    const created =
      user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt);
    return new Date(created.getTime() + defaultTrialDays * MS_PER_DAY);
  }
  return null;
}

export function isTrialActive(
  user: TrialUserFields,
  defaultTrialDays: number,
  now = new Date(),
): boolean {
  const endsAt = resolveTrialEndsAt(user, defaultTrialDays);
  return endsAt != null && endsAt > now;
}

export function trialDaysRemaining(
  user: TrialUserFields,
  defaultTrialDays: number,
  now = new Date(),
): number {
  const endsAt = resolveTrialEndsAt(user, defaultTrialDays);
  if (!endsAt || endsAt <= now) return 0;
  return Math.ceil((endsAt.getTime() - now.getTime()) / MS_PER_DAY);
}

export function defaultTrialEndsAt(defaultTrialDays: number, from = new Date()): Date {
  return new Date(from.getTime() + defaultTrialDays * MS_PER_DAY);
}
