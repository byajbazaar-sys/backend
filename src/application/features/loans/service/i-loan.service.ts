import { Paged } from '@shared-libs';
import { Loan } from '../domain';
import { LoansFilterOptions } from '../options';

export const LOAN_SERVICE = 'ILoanService';

export interface ILoanService {
  create(data: Loan): Promise<Loan>;
  getById(id: string): Promise<Loan>;
  getLoans(params: LoansFilterOptions): Promise<Paged<Loan>>;
  delete(id: string, userId: string): Promise<void>;
}

