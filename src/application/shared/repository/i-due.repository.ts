import { Paged } from '@shared-libs';
import { DuesFilterOptions, Due } from '../../features';
import { EDueType } from '../../shared';

export const DUES_REPOSITORY = 'IDuesRepository';

export interface IDuesRepository {
  listDues(params: DuesFilterOptions): Promise<Paged<Due>>;
  create(due: Due): Promise<Due>;
  bulkCreate(dues: Due[]): Promise<Due[]>;
  updatePastDues(): Promise<number>;
  findById(id: string, createdBy: string): Promise<Due>;
  findByIdWithDetails(id: string, createdBy: string): Promise<Due>;
  update(id: string, due: Due): Promise<Due>;
  deleteByLoanId(loanId: string, types?: EDueType[]): Promise<void>;
  findByLoanIdAndType(loanId: string, types: EDueType[]): Promise<Due[]>;
}
