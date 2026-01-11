import { Paged } from '@shared-libs';
import { Loan } from '../domain';
import { LoansFilterOptions, LoanStatsFilterOptions } from '../options';
import { LoanStats } from '../domain';

export const LOAN_SERVICE = 'ILoanService';

export interface ILoanService {
  create(data: Loan): Promise<Loan>;
  getById(id: string): Promise<Loan>;
  getLoans(params: LoansFilterOptions): Promise<Paged<Loan>>;
  delete(id: string, userId: string): Promise<void>;
  getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats>;
}
