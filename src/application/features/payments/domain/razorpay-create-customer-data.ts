import { Expose } from 'class-transformer';

export class RazorpayCreateCustomerData {
  @Expose()
  name: string;

  @Expose()
  email: string;

  @Expose()
  contact?: string;

  @Expose()
  failExisting?: boolean;
}
