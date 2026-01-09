import { Paged } from '@shared-libs';
import { DuesFilterOptions, Due } from '../../features';

export const DUES_REPOSITORY = 'IDuesRepository';

export interface IDuesRepository {
  listDues(params: DuesFilterOptions): Promise<Paged<Due>>;
  create(due: Due): Promise<Due>;
  bulkCreate(dues: Due[]): Promise<Due[]>;
  updatePastDues(): Promise<number>;
}
