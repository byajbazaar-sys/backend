import { Expose, Type } from 'class-transformer';

import { EBillLogAction } from '../enums';
import { BillLogChange } from './bill-log-change';

export class BillLog {
  @Expose()
  id?: string;

  @Expose()
  billId?: string | null;

  /** Kept even after the bill is deleted. */
  @Expose()
  billNumber: string;

  /** The shop (bill owner). */
  @Expose()
  userId: string;

  @Expose()
  action: EBillLogAction;

  @Expose()
  @Type(() => BillLogChange)
  changes: BillLogChange[];

  /** Full copy of the bill when it was deleted, so nothing is lost. */
  @Expose()
  snapshot?: Record<string, unknown> | null;

  /** web | mobile | api */
  @Expose()
  channel?: string | null;

  @Expose()
  performedBy?: string | null;

  @Expose()
  performedByName?: string | null;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;
}
