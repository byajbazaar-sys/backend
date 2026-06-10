import { Loan, LoanExtended, LoanItem } from '../domain';
import { LoansFilterOptions, LoansDownloadFilterOptions, LoanStatsFilterOptions } from '../options';
import { LoanStats } from '../domain';
import { ELoanStatus } from '../enums';

export const LOAN_SERVICE = 'ILoanService';

export interface ILoanService {
  create(data: Loan): Promise<Loan>;
  getById(id: string, createdBy: string): Promise<Loan>;
  getLoans(params: LoansFilterOptions): Promise<LoanExtended>;
  getLoansForDownload(params: LoansDownloadFilterOptions): Promise<Loan[]>;
  update(id: string, updateData: Loan): Promise<Loan>;
  updateStatus(id: string, status: ELoanStatus, createdBy: string): Promise<Loan>;
  updateLoanItem(itemId: string, updateData: Partial<LoanItem>, createdBy: string): Promise<LoanItem>;
  uploadVoucherSignatures(
    loanId: string,
    createdBy: string,
    signerName: string,
    signatureFile: Express.Multer.File,
    fingerprintFile?: Express.Multer.File | null,
    removeFingerprint?: boolean,
  ): Promise<Loan>;
  recalculateDuesForLoan(loanId: string, createdBy: string): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
  getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats>;
  closeOpenLoansPastTenure(): Promise<number>;
}
