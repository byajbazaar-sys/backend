import { Expose } from 'class-transformer';

/** A question the business answers the same way every time (shown to the bot as a fact). */
export class InboxFaq {
  @Expose()
  question: string;

  @Expose()
  answer: string;
}
