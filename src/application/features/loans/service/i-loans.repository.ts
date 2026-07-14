import { Loan, LoanExtended, LoanStats } from '../domain';
import { LoansFilterOptions, LoansDownloadFilterOptions, LoanStatsFilterOptions } from '../options';
import { Due, EDueType } from '../../../shared';

export const LOANS_REPOSITORY = 'LOANS_REPOSITORY';

export interface ILoansRepository {
    create(createLoan: Loan): Promise<Loan>;
    findByCustomerId(customerId: string): Promise<Loan[]>;
    update(id: string, updateDto: Loan): Promise<Loan| null>;
    /**
     * Atomically update a loan and replace its unpaid dues (paid dues are never touched).
     */
    updateAndReplaceUnpaidDues(
      id: string,
      updateDto: Loan,
      unpaidDues: Due[],
      unpaidTypes?: EDueType[],
    ): Promise<Loan| null>;
    findById(id: string, createdBy: string): Promise<Loan | null>;
    findByIds(ids: string[]): Promise<Loan[]>;
    findByCreatedBy(createdBy: string): Promise<Loan[]>;
    listLoans(params: LoansFilterOptions): Promise<LoanExtended>;
    listAllLoans(params: LoansDownloadFilterOptions): Promise<Loan[]>;
    delete(id: string, createdBy: string): Promise<void>;
    deleteByCustomerId(customerId: string, createdBy: string): Promise<void>;
    getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats>;
    findOpenLoanIdsPastMaturity(): Promise<Array<{ id: string; createdBy: string }>>;
}
