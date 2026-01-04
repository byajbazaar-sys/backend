import { Paged } from '@shared-libs';
import { Loan } from '../domain';
import { UpdateLoanRequestModel } from '../models';
import { LoansFilterOptions } from '../options';

export const LOAN_SERVICE = 'ILoanService';

export interface ILoanService {
  create(data: Loan): Promise<Loan>;
  getById(id: string): Promise<Loan>;
  getLoans(params: LoansFilterOptions): Promise<Paged<Loan>>;
  update(id: string, body: UpdateLoanRequestModel, userId: string): Promise<Loan>;
  delete(id: string, userId: string): Promise<void>;
}

