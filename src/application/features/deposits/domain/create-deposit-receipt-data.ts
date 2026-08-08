import { Expose } from 'class-transformer';

export class CreateDepositReceiptData {
  @Expose()
  depositTransactionId: string;

  @Expose()
  receiptNumber: string;

  @Expose()
  createdBy: string;
}
