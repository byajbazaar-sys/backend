/** The facts the bot may answer from, as short lines per section (empty sections are left out of the prompt). */
export interface InboxKnowledge {
  shop: string[];
  faqs: string[];
  rates: string[];
  catalogue: string[];
  /** Only the sender's own records (WhatsApp, matched by number). */
  account: string[];
  /** The matched customer record, saved on the conversation. */
  customerId?: string | null;
  customerName?: string | null;
}
