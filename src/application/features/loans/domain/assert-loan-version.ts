import { ConflictException } from '@nestjs/common';

import { Loan } from './loan';

/**
 * Optimistic concurrency check for callers working from a snapshot they read
 * earlier — an open edit form, a rendered transaction list. Passing the version
 * that snapshot was built from turns "silently overwrite a change I never saw"
 * into a 409 the client can recover from by reloading.
 *
 * Must be called while holding the loan's row lock, otherwise the version can
 * move between this check and the write it is guarding.
 *
 * Omitting the version skips the check, so existing API clients keep working.
 */
export const assertLoanVersion = (loan: Loan, expectedVersion?: number): void => {
  if (expectedVersion === undefined || expectedVersion === null) return;
  // A missing loan is reported by the caller's own not-found handling.
  if (!loan) return;

  const currentVersion = Number(loan.version ?? 0);
  if (currentVersion !== Number(expectedVersion)) {
    throw new ConflictException(
      `This loan was changed by someone else since you loaded it (expected version ${expectedVersion}, current ${currentVersion}). Reload and try again.`,
    );
  }
};
