import { LoanEffect } from './loan-effect';

/**
 * Fields a replay rewrites on a transaction row after recomputing its effect
 * from the loan's checkpoint. `dueId` is included because rebuilding the
 * schedule replaces unpaid due rows, so a due payment has to be re-pointed at
 * the row that replay actually marked paid.
 */
export interface TransactionReplayPatch {
  amount?: number;
  dueId?: string;
  effect: LoanEffect;
  periodsAtCreation?: number;
}
