import { Expose } from 'class-transformer';

export class CreateDepositAccountData {
  @Expose()
  name?: string;

  @Expose()
  notes?: string;
}
