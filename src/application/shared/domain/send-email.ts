import { Expose, Type } from 'class-transformer';
import { EmailAttachment } from './email-attachment';
import { EmailRecipient } from './email-recipient';

export class SendEmail {
  @Expose()
  public to: string;

  @Expose()
  public subject: string;

  @Expose()
  public body: string;

  @Expose()
  @Type(() => EmailRecipient)
  public from?: EmailRecipient;

  @Expose()
  public isHtml?: boolean;

  @Expose()
  @Type(() => EmailAttachment)
  public attachments?: EmailAttachment[];
}
