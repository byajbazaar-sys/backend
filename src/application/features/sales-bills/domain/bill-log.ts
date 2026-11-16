import { Expose, Type } from 'class-transformer';

import { EBillLogAction } from '../enums/e-bill-log-action.enum';

/** One changed value in an edit: a bill field, or an item line (`items[<line>].<field>`). */
export class BillLogChange {
  @Expose()
  field: string;

  @Expose()
  label: string;

  @Expose()
  from: string | number | null;

  @Expose()
  to: string | number | null;
}

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
