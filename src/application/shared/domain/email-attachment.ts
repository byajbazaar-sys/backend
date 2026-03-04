import { Expose } from 'class-transformer';

export class EmailAttachment {
  @Expose()
  public content: string;

  @Expose()
  public filename: string;

  @Expose()
  public type?: string;

  @Expose()
  public disposition?: string;
}
