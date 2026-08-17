import { Due, EDueType } from '../../../shared';
import { Loan, LoanExtended, LoanStats, LoanBaselineData, OpenLoanMaturityRef } from '../domain';
import { LoansFilterOptions, LoansDownloadFilterOptions, LoanStatsFilterOptions } from '../options';

export const LOANS_REPOSITORY = 'LOANS_REPOSITORY';

export interface ILoansRepository {
  create(createLoan: Loan): Promise<Loan>;
  findByCustomerId(customerId: string): Promise<Loan[]>;
  update(id: string, updateDto: Loan): Promise<Loan | null>;
  /**
   * Atomically update a loan and replace its unpaid dues (paid dues are never touched).
   */
  updateAndReplaceUnpaidDues(
    id: string,
    updateDto: Loan,
    unpaidDues: Due[],
    unpaidTypes?: EDueType[],
  ): Promise<Loan | null>;
  /** Atomically reserves the next per-loan transaction sequence number. */
  allocateTransactionSeq(loanId: string, createdBy: string): Promise<number>;
  /** Moves the replay checkpoint; call after any change that recomputes balances. */
  setBaseline(loanId: string, createdBy: string, baseline: LoanBaselineData): Promise<void>;
  getMaxTransactionSeq(loanId: string): Promise<number>;
  findById(id: string, createdBy: string): Promise<Loan>;
  /**
   * Reads the loan while holding its row lock until the surrounding
   * transaction ends. Use before any read-modify-write on balances.
   */
  lockLoan(id: string, createdBy: string): Promise<Loan>;
  findByIds(ids: string[]): Promise<Loan[]>;
  findByCreatedBy(createdBy: string): Promise<Loan[]>;
  listLoans(params: LoansFilterOptions): Promise<LoanExtended>;
  listAllLoans(params: LoansDownloadFilterOptions): Promise<Loan[]>;
  delete(id: string, createdBy: string): Promise<void>;
  deleteByCustomerId(customerId: string, createdBy: string): Promise<void>;
  getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats>;
  findOpenLoanIdsPastMaturity(): Promise<OpenLoanMaturityRef[]>;
}
