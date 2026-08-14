import { Paged } from '@shared-libs';

import { DuesFilterOptions } from '../../features';
import { EDueType } from '../../shared';
import { Due } from '../domain';

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
  /**
   * Clears a loan's schedule except for the rows named. Used to rewind to a
   * replay checkpoint, where dues paid by frozen history must survive.
   */
  deleteByLoanIdExcept(loanId: string, keepDueIds: string[]): Promise<void>;
  findByLoanId(loanId: string): Promise<Due[]>;
  findByLoanIdAndType(loanId: string, types: EDueType[]): Promise<Due[]>;
}
