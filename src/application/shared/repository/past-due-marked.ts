/** A due the scheduled job has just moved from upcoming to past due. */
export interface PastDueMarked {
  dueId: string;
  userId: string;
  loanId: string;
  customerId: string;
  dueAmount: number;
  dueDate: Date;
}
