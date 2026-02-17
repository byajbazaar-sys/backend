import { Loan, LoanExtended, LoanItem } from '../domain';
import { LoansFilterOptions, LoanStatsFilterOptions } from '../options';
import { LoanStats } from '../domain';
import { ELoanStatus } from '../enums';

export const LOAN_SERVICE = 'ILoanService';

export interface ILoanService {
  create(data: Loan): Promise<Loan>;
  getById(id: string, createdBy: string): Promise<Loan>;
  getLoans(params: LoansFilterOptions): Promise<LoanExtended>;
  update(id: string, updateData: Loan): Promise<Loan>;
  updateStatus(id: string, status: ELoanStatus, createdBy: string): Promise<Loan>;
  updateLoanItem(loanId: string, itemId: string, updateData: Partial<LoanItem>, createdBy: string): Promise<LoanItem>;
  delete(id: string, userId: string): Promise<void>;
  getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats>;
}
