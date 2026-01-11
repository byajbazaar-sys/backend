import { Paged } from '@shared-libs';
import { Loan } from '../domain';
import { LoansFilterOptions, LoanStatsFilterOptions } from '../options';
import { LoanStats } from '../domain';

export const LOANS_REPOSITORY = 'LOANS_REPOSITORY';

export interface ILoansRepository {
  create(createLoan: Loan): Promise<Loan>;
  findByCustomerId(customerId: string): Promise<Loan[]>;
  update(id: string, updateDto: Partial<Loan>): Promise<Loan>;
  findById(id: string): Promise<Loan>;
  findByIds(ids: string[]): Promise<Loan[]>;
  findByCreatedBy(createdBy: string): Promise<Loan[]>;
  listLoans(params: LoansFilterOptions): Promise<Paged<Loan>>;
  delete(id: string): Promise<void>;
  getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats>;
}
