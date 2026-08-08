import { LoanItem } from '../domain';
import { UpdateLoanItemPatch } from '../models';

export const LOAN_ITEMS_REPOSITORY = 'LOAN_ITEMS_REPOSITORY';

export interface ILoanItemsRepository {
  create(createLoanItem: LoanItem): Promise<LoanItem>;
  bulkInsert(createLoanItems: LoanItem[]): Promise<LoanItem[]>;
  findById(id: string, loanId: string): Promise<LoanItem>;
  findByIdOnly(id: string): Promise<LoanItem>;
  findByLoanId(loanId: string): Promise<LoanItem[]>;
  findByLoanIds(loanIds: string[]): Promise<LoanItem[]>;
  update(id: string, loanId: string, updateData: UpdateLoanItemPatch): Promise<LoanItem>;
  deleteByLoanId(loanId: string): Promise<void>;
  findByItemId(itemId: string): Promise<LoanItem>
}
