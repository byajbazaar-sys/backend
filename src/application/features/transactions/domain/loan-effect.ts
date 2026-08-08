/**
 * Signed changes a transaction applied to the loan's running totals.
 * Recording these at creation makes rollback exact subtraction instead of
 * re-deriving a formula against state that has since moved on.
 */
export interface LoanEffect {
  amountRemainingDelta: number;
  amountPaidDelta: number;
  interestRemainingDelta: number;
  interestPaidDelta: number;
}

export const emptyLoanEffect = (): LoanEffect => ({
  amountRemainingDelta: 0,
  amountPaidDelta: 0,
  interestRemainingDelta: 0,
  interestPaidDelta: 0,
});
