import { Expose } from 'class-transformer';

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
