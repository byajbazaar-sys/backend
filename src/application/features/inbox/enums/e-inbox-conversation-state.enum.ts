/** Who answers the next customer message in a conversation. */
export enum EInboxConversationState {
  /** The bot answers new messages (when automation is on for the channel). */
  Auto = 'auto',
  /** The bot handed over (or automation is off): waiting for the business owner's reply. */
  NeedsReply = 'needs_reply',
  /** The owner replied: the bot stays quiet here until handed back, or a day after the owner's last reply. */
  Owner = 'owner',
}
