import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { IProductImageAiService, PRODUCT_IMAGE_AI_SERVICE } from '../../../shared';
import { InboxBotDecision, InboxConversation, InboxKnowledge, InboxMessage, InboxSettings } from '../domain';
import {
  buildBotSystemPrompt,
  buildBotUserPrompt,
  defaultHandoffNote,
  parseBotDecision,
  unknownAmounts,
} from '../utils';

/** Workers AI models for customer replies: Gemma 4 26B writes Hindi / Hinglish / Gujarati best on the free plan. */
const PRIMARY_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const FALLBACK_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/**
 * Decides one reply: the answer from the shop's facts, or a hand-over to the owner. Anything unsure ends as a
 * hand-over — an unreadable model answer, a price the facts do not contain, a model that errors twice.
 */
@Injectable()
export class InboxBotService {
  constructor(
    @Inject(PRODUCT_IMAGE_AI_SERVICE) private readonly ai: IProductImageAiService,
    @InjectPinoLogger(InboxBotService.name) private readonly logger: PinoLogger,
  ) {}

  async decide(input: {
    shopName: string;
    settings: InboxSettings;
    conversation: InboxConversation;
    knowledge: InboxKnowledge;
    history: InboxMessage[];
    message: InboxMessage;
  }): Promise<InboxBotDecision> {
    const { settings, message } = input;
    const handoff = (reason: string, note?: string): InboxBotDecision => ({
      handoff: true,
      reason,
      reply: settings.handoffMessage?.trim() || note?.trim() || defaultHandoffNote(message.text),
    });

    const system = buildBotSystemPrompt({
      shopName: input.shopName,
      channel: input.conversation.channel,
      knowledge: input.knowledge,
      instructions: settings.instructions,
      today: new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }),
    });
    const user = buildBotUserPrompt(
      input.history.map((item) => ({ author: item.author, text: item.text })),
      message.text,
    );

    let raw: string;
    try {
      raw = await this.generate(system, user);
    } catch (err) {
      this.logger.warn({ err: (err as Error)?.message }, 'Inbox bot model unavailable — handing over');
      return handoff('the assistant could not answer right now');
    }
    const decision = parseBotDecision(raw);
    if (!decision) {
      this.logger.warn({ reply: raw.slice(0, 300) }, 'Inbox bot answer was not usable — handing over');
      return handoff('the assistant was not sure');
    }
    if (decision.handoff) return handoff(decision.reason || 'needs the shop', decision.reply);

    const facts = [
      input.knowledge.rates,
      input.knowledge.catalogue,
      input.knowledge.account,
      input.knowledge.faqs,
      input.knowledge.shop,
    ]
      .flat()
      .join('\n');
    const invented = unknownAmounts(decision.reply, facts);
    if (invented.length) {
      this.logger.warn({ invented }, 'Inbox bot quoted an amount not in the facts — handing over');
      return handoff('the assistant was not sure of a price');
    }
    return decision;
  }

  private async generate(system: string, user: string): Promise<string> {
    const options = { temperature: 0.2, maxTokens: 500 };
    const model = process.env.INBOX_TEXT_MODEL?.trim() || PRIMARY_MODEL;
    try {
      return await this.ai.generateText(system, user, { ...options, model });
    } catch (err) {
      if (model === FALLBACK_MODEL) throw err;
      return this.ai.generateText(system, user, { ...options, model: FALLBACK_MODEL });
    }
  }
}
