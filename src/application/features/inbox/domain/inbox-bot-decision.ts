/** What the bot decided for one customer message. */
export interface InboxBotDecision {
  /** True: the owner answers; `reply` is the short note the customer gets meanwhile. */
  handoff: boolean;
  reply: string;
  reason?: string;
}
