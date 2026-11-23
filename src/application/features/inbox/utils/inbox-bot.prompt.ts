import { InboxBotDecision, InboxKnowledge } from '../domain';
import { EInboxChannel, EInboxMessageAuthor } from '../enums';

/** Messages of the conversation the bot reads before the new one (oldest first). */
export const INBOX_HISTORY_MESSAGES = 10;

/** A reply longer than this is cut (Instagram takes 1,000 bytes per message; a short answer reads better anyway). */
export const INBOX_REPLY_MAX_CHARS = 700;

const CHANNEL_NAMES: Record<EInboxChannel, string> = {
  [EInboxChannel.WhatsApp]: 'WhatsApp',
  [EInboxChannel.Instagram]: 'Instagram',
};

/**
 * The bot's instructions and the shop's facts. The bot answers only from the facts and hands everything else to the
 * owner: a made-up price or promise costs the jeweller far more than a short wait for a human reply.
 */
export function buildBotSystemPrompt(input: {
  shopName: string;
  channel: EInboxChannel;
  knowledge: InboxKnowledge;
  instructions?: string | null;
  today: string;
}): string {
  const { knowledge } = input;
  const sections: string[] = [];
  const add = (title: string, lines: string[]) => {
    if (lines.length) sections.push(`${title}:\n${lines.map((line) => `- ${line}`).join('\n')}`);
  };
  add('SHOP', knowledge.shop);
  add('FREQUENTLY ASKED QUESTIONS (the shop answers these this way)', knowledge.faqs);
  add("TODAY'S METAL RATES (per gram)", knowledge.rates);
  add('CATALOGUE PIECES MATCHING THE MESSAGE', knowledge.catalogue);
  add("THIS CUSTOMER'S OWN ACCOUNT (verified by their WhatsApp number)", knowledge.account);
  const facts = sections.length ? sections.join('\n\n') : '- (no facts about the shop are available)';
  const extra = input.instructions?.trim()
    ? `\nThe shop owner's extra instructions: ${input.instructions.trim()}\n`
    : '';

  return (
    `You answer customers of the jewellery shop "${input.shopName}" on ${CHANNEL_NAMES[input.channel]}, on the ` +
    `shop's behalf. You are an automated assistant: never claim to be a person. Today is ${input.today}.\n\n` +
    'Answer ONLY from the FACTS below. Hand the conversation over to the shop owner — do not answer it yourself — ' +
    'when the answer is not in the facts, or the customer wants to buy, order, book, reserve, bargain, get a custom ' +
    'quote, sell or exchange old gold, complain, or asks for a person.\n\n' +
    'Rules:\n' +
    '- Never invent or estimate prices, weights, stock, discounts, dates or policies. Rates change: say when a rate ' +
    'was last updated.\n' +
    "- Account details (loans, dues, orders) only from THIS CUSTOMER'S OWN ACCOUNT, and only about this customer.\n" +
    '- Reply in the language and script the customer writes in (English, Hindi, Hinglish, Gujarati…), in one to ' +
    'three short, friendly sentences. Plain text, no markdown, at most one emoji.\n' +
    '- If the customer only greets you, greet back and ask how you can help.\n' +
    extra +
    '\nReply with JSON only, one of:\n' +
    '{"handoff": false, "reply": "<your answer>"}\n' +
    '{"handoff": true, "reason": "<why, a few words in English>", "reply": "<a short polite note, in the customer\'s ' +
    'language, that someone from the shop will reply soon>"}\n\n' +
    `FACTS:\n${facts}`
  );
}

/** The conversation so far and the message to answer. */
export function buildBotUserPrompt(history: { author: EInboxMessageAuthor; text: string }[], latest: string): string {
  const lines = history.map(
    (message) => `${message.author === EInboxMessageAuthor.Customer ? 'Customer' : 'Shop'}: ${oneLine(message.text)}`,
  );
  return (
    (lines.length ? `Conversation so far (oldest first):\n${lines.join('\n')}\n\n` : '') +
    `The customer's new message: ${JSON.stringify(oneLine(latest))}`
  );
}

/** The model's JSON answer, or null when it is not usable (then the owner answers). */
export function parseBotDecision(raw: string): InboxBotDecision | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const reply = typeof record.reply === 'string' ? record.reply.trim() : '';
  const handoff = record.handoff === true || record.handoff === 'true';
  if (!handoff && !reply) return null;
  return {
    handoff,
    reply: clip(reply),
    reason: typeof record.reason === 'string' ? record.reason.trim().slice(0, 200) : undefined,
  };
}

/**
 * Rupee amounts in a reply that appear nowhere in the facts: a sign the model made a price up. "₹6,850", "Rs 500",
 * "500 rupees" and "५०० रुपये" style amounts are compared digit for digit (commas and spaces ignored).
 */
export function unknownAmounts(reply: string, facts: string): string[] {
  const digitsOf = (value: string) => toAsciiDigits(value).replace(/[,\s]/g, '');
  const factDigits = digitsOf(facts);
  const found = new Set<string>();
  const patterns = [
    /(?:₹|rs\.?|inr)\s*([\d०-९][\d०-९,\s]*(?:\.\d+)?)/gi,
    /([\d०-९][\d०-९,]*(?:\.\d+)?)\s*(?:rupees?|rupaye|rupay|रुपये|रुपए|रु\.?|રૂપિયા)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of reply.matchAll(pattern)) {
      const amount = digitsOf(match[1]).replace(/\.$/, '');
      if (amount && !factDigits.includes(amount)) found.add(match[0].trim());
    }
  }
  return [...found];
}

/** The note a customer gets when the bot hands over and neither the owner nor the model wrote one. */
export function defaultHandoffNote(customerText: string): string {
  if (/[઀-૿]/.test(customerText)) return 'આભાર! દુકાનમાંથી કોઈ જલ્દી તમને જવાબ આપશે.';
  if (/[ऀ-ॿ]/.test(customerText)) return 'धन्यवाद! दुकान से कोई जल्द ही आपको जवाब देगा।';
  if (/\b(kya|hai|kitna|kitne|kaise|bhai|bhaiya|ji|aap|hum|mujhe|chahiye|kab|nahi|haan)\b/i.test(customerText)) {
    return 'Dhanyavaad! Shop se koi jaldi aapko reply karega.';
  }
  return 'Thank you! Someone from the shop will reply to you shortly.';
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

function clip(text: string): string {
  if (text.length <= INBOX_REPLY_MAX_CHARS) return text;
  const cut = text.slice(0, INBOX_REPLY_MAX_CHARS);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('। '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (sentence > INBOX_REPLY_MAX_CHARS / 2 ? cut.slice(0, sentence + 1) : cut).trim();
}

function toAsciiDigits(value: string): string {
  return value.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)));
}
