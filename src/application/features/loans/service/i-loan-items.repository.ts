import { LoanItem } from '../domain';

export const LOAN_ITEMS_REPOSITORY = 'LOAN_ITEMS_REPOSITORY';

export interface ILoanItemsRepository {
  create(createLoanItem: LoanItem): Promise<LoanItem>;
  bulkInsert(createLoanItems: LoanItem[]): Promise<LoanItem[]>;
  findByLoanId(loanId: string): Promise<LoanItem[]>;
  deleteByLoanId(loanId: string): Promise<void>;
}
