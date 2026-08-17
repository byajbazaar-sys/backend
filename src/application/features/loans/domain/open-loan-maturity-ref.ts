import { Expose } from 'class-transformer';

export class OpenLoanMaturityRef {
  @Expose()
  id: string;

  @Expose()
  createdBy: string;
}
