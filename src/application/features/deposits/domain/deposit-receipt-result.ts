import { Expose } from 'class-transformer';

export class DepositReceiptResult {
  @Expose()
  receiptNumber: string;
}
