import { Expose } from 'class-transformer';

export class EmailRecipient {
  @Expose()
  public email: string;

  @Expose()
  public name?: string;
}
