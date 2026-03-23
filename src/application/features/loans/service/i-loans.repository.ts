import { Paged } from '@shared-libs';
import { Loan, LoanExtended } from '../domain';
import { LoansFilterOptions, LoansDownloadFilterOptions, LoanStatsFilterOptions } from '../options';
import { LoanStats } from '../domain';

export const LOANS_REPOSITORY = 'LOANS_REPOSITORY';

export interface ILoansRepository {
    create(createLoan: Loan): Promise<Loan>;
    findByCustomerId(customerId: string): Promise<Loan[]>;
    update(id: string, updateDto: Loan): Promise<Loan>;
    findById(id: string, createdBy: string): Promise<Loan>;
    findByIds(ids: string[]): Promise<Loan[]>;
    findByCreatedBy(createdBy: string): Promise<Loan[]>;
    listLoans(params: LoansFilterOptions): Promise<LoanExtended>;
    listAllLoans(params: LoansDownloadFilterOptions): Promise<Loan[]>;
    delete(id: string, createdBy: string): Promise<void>;
    deleteByCustomerId(customerId: string, createdBy: string): Promise<void>;
    getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats>;
    findOpenLoanIdsPastMaturity(): Promise<Array<{ id: string; createdBy: string }>>;
}
