import { Expose, Type } from 'class-transformer';

import { InboxFaq } from './inbox-faq';

/** A business's customer-chat automation: which channels the bot answers, what it may use, how the owner is alerted. */
export class InboxSettings {
  @Expose()
  userId: string;

  @Expose()
  whatsappEnabled: boolean;

  @Expose()
  instagramEnabled: boolean;

  /** Shop facts from the profile and these settings (address, timings, contact, policies, FAQs). */
  @Expose()
  answerShopInfo: boolean;

  /** Today's gold and silver rates the business keeps in the app. */
  @Expose()
  answerRates: boolean;

  /** Pieces and listed prices from the business's public catalogue. */
  @Expose()
  answerCatalogue: boolean;

  /** The customer's own loans, dues and orders — WhatsApp only, when the sender's number matches the customer. */
  @Expose()
  answerAccount: boolean;

  @Expose()
  businessHours: string | null;

  /** Services, making charges, exchange / buy-back and other policies, in the owner's words. */
  @Expose()
  about: string | null;

  @Expose()
  @Type(() => InboxFaq)
  faqs: InboxFaq[];

  /** Extra guidance for the bot (tone, things it must not say). */
  @Expose()
  instructions: string | null;

  /** What a customer is told when the bot hands over (blank: a short note in the customer's language). */
  @Expose()
  handoffMessage: string | null;

  @Expose()
  notifyEmail: boolean;

  @Expose()
  notifyPush: boolean;

  @Expose()
  updatedAt?: Date;
}

/** A business that never opened the settings: the bot is off and may use everything once switched on. */
export function defaultInboxSettings(userId: string): InboxSettings {
  return {
    userId,
    whatsappEnabled: false,
    instagramEnabled: false,
    answerShopInfo: true,
    answerRates: true,
    answerCatalogue: true,
    answerAccount: true,
    businessHours: null,
    about: null,
    faqs: [],
    instructions: null,
    handoffMessage: null,
    notifyEmail: true,
    notifyPush: true,
  };
}
