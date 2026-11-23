import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { DUES_REPOSITORY, EDueType, IDuesRepository } from '../../../shared';
import { CUSTOMERS_REPOSITORY, ICustomersRepository } from '../../customers/service/i-customers.repository';
import { ELoanStatus } from '../../loans/enums';
import { ILoansRepository, LOANS_REPOSITORY } from '../../loans/service/i-loans.repository';
import { IMetalRateService, METAL_RATE_SERVICE } from '../../metal-rates/service/i-metal-rate.service';
import { EOrderStatus } from '../../orders/enums';
import { IOrdersRepository, ORDERS_REPOSITORY } from '../../orders/service/i-orders.repository';
import { ListPublicCatalogQueryModel } from '../../public-catalog/models/list-public-catalog-query.model';
import { IPublicCatalogService, PUBLIC_CATALOG_SERVICE } from '../../public-catalog/service/i-public-catalog.service';
import { User } from '../../users/domain/user';
import { IUsersRepository, USERS_REPOSITORY } from '../../users/service/i-users.repository';
import { InboxConversation, InboxKnowledge, InboxSettings } from '../domain';
import { EInboxChannel } from '../enums';

/** Kinds of piece a customer may name (English and the Hindi words jewellers hear), searched in the catalogue. */
const PIECE_WORDS: { words: RegExp; search: string }[] = [
  { words: /\b(chains?)\b/i, search: 'chain' },
  { words: /\b(rings?|anguthi|angoothi|ring)\b/i, search: 'ring' },
  { words: /\b(necklaces?|haar|har|choker|rani\s?haar)\b/i, search: 'necklace' },
  { words: /\b(bangles?|kangan|chudi|churi|chooda)\b/i, search: 'bangle' },
  { words: /\b(kadas?|kara)\b/i, search: 'kada' },
  { words: /\b(bracelets?)\b/i, search: 'bracelet' },
  { words: /\b(ear\s?rings?|jhumk\w*|bali|balis|tops|studs?|chandbali)\b/i, search: 'earring' },
  { words: /\b(payal|anklets?|pajeb)\b/i, search: 'payal' },
  { words: /\b(mangal\s?sutra)\b/i, search: 'mangalsutra' },
  { words: /\b(pendants?|lockets?)\b/i, search: 'pendant' },
  { words: /\b(nath|nathni|nose\s?(?:ring|pin)s?|laung)\b/i, search: 'nose' },
  { words: /\b(tikk?a|maang\s?tikk?a)\b/i, search: 'tikka' },
  { words: /\b(coins?|sikka|biscuit)\b/i, search: 'coin' },
  { words: /\b(sets?)\b/i, search: 'set' },
];

const RATE_LABELS: [keyof RateFields, string, keyof RateFields][] = [
  ['gold24', '24K gold', 'gold24UpdatedAt'],
  ['gold22', '22K gold', 'gold22UpdatedAt'],
  ['gold20', '20K gold', 'gold20UpdatedAt'],
  ['gold18', '18K gold', 'gold18UpdatedAt'],
  ['silver999', 'Silver 999', 'silver999UpdatedAt'],
  ['silver925', 'Silver 925', 'silver925UpdatedAt'],
];

type RateFields = Record<
  | 'gold24'
  | 'gold22'
  | 'gold20'
  | 'gold18'
  | 'silver999'
  | 'silver925'
  | 'gold24UpdatedAt'
  | 'gold22UpdatedAt'
  | 'gold20UpdatedAt'
  | 'gold18UpdatedAt'
  | 'silver999UpdatedAt'
  | 'silver925UpdatedAt',
  number | string | null | undefined
>;

/** What the bot may answer from, per business and per message — only the sections the owner allowed. */
@Injectable()
export class InboxKnowledgeService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: IUsersRepository,
    @Inject(METAL_RATE_SERVICE) private readonly rates: IMetalRateService,
    @Inject(PUBLIC_CATALOG_SERVICE) private readonly catalogue: IPublicCatalogService,
    @Inject(CUSTOMERS_REPOSITORY) private readonly customers: ICustomersRepository,
    @Inject(LOANS_REPOSITORY) private readonly loans: ILoansRepository,
    @Inject(DUES_REPOSITORY) private readonly dues: IDuesRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: IOrdersRepository,
    @InjectPinoLogger(InboxKnowledgeService.name) private readonly logger: PinoLogger,
  ) {}

  async shopName(userId: string): Promise<string> {
    const user = await this.users.findById(userId).catch(() => null);
    return user?.businessName?.trim() || 'our shop';
  }

  async gather(settings: InboxSettings, conversation: InboxConversation, question: string): Promise<InboxKnowledge> {
    const user = await this.users.findById(settings.userId);
    const knowledge: InboxKnowledge = {
      shop: this.shopFacts(user, settings),
      faqs: settings.answerShopInfo
        ? settings.faqs
            .filter((faq) => faq.question?.trim() && faq.answer?.trim())
            .map((faq) => `Q: ${faq.question.trim()} — A: ${faq.answer.trim()}`)
        : [],
      rates: [],
      catalogue: [],
      account: [],
    };
    // Each section is best effort: a failing source leaves its facts out, and the bot hands those questions over.
    const [rates, catalogue, account] = await Promise.all([
      settings.answerRates ? this.rateFacts(settings.userId).catch((err) => this.skip('rates', err, [])) : [],
      settings.answerCatalogue
        ? this.catalogueFacts(user, question).catch((err) => this.skip('catalogue', err, []))
        : [],
      settings.answerAccount && conversation.channel === EInboxChannel.WhatsApp
        ? this.accountFacts(settings.userId, conversation.externalUserId).catch((err) =>
            this.skip('account', err, null),
          )
        : null,
    ]);
    knowledge.rates = rates;
    knowledge.catalogue = catalogue;
    if (account) {
      knowledge.account = account.lines;
      knowledge.customerId = account.customerId;
      knowledge.customerName = account.customerName;
    }
    return knowledge;
  }

  private shopFacts(user: User, settings: InboxSettings): string[] {
    const facts = [`Name: ${user.businessName?.trim() || 'the shop'}`];
    if (!settings.answerShopInfo) return facts;
    const add = (label: string, value?: string | null) => {
      if (value?.trim()) facts.push(`${label}: ${value.trim()}`);
    };
    add('Owner', user.proprietorName);
    add('Address', [user.address, user.state].filter((part) => part?.trim()).join(', '));
    add('Phone', user.phoneNumber);
    add('Other phone', user.alternatePhoneNumber);
    if (user.catalogEnabled && user.catalogSlug) {
      const web = (process.env.WEB_APP_DOMAIN ?? '').replace(/\/$/, '');
      if (web) add('Online catalogue', `${web}/catalog/${user.catalogSlug}`);
    }
    add('Opening hours', settings.businessHours);
    for (const line of (settings.about ?? '').split(/\n+/)) add('About the shop', line);
    return facts;
  }

  private async rateFacts(userId: string): Promise<string[]> {
    const current = (await this.rates.getCurrent(userId)) as unknown as RateFields;
    const facts: string[] = [];
    for (const [rateKey, label, updatedKey] of RATE_LABELS) {
      const rate = Number(current?.[rateKey]);
      if (!Number.isFinite(rate) || rate <= 0) continue;
      const updated = current?.[updatedKey];
      facts.push(`${label}: ₹${money(rate)} per gram${updated ? ` (updated ${day(new Date(String(updated)))})` : ''}`);
    }
    return facts.length ? facts : ['No rates are set in the app right now — hand over rate questions.'];
  }

  private async catalogueFacts(user: User, question: string): Promise<string[]> {
    if (!user.catalogEnabled || !user.catalogSlug) return [];
    const searches = PIECE_WORDS.filter((piece) => piece.words.test(question))
      .map((piece) => piece.search)
      .slice(0, 2);
    if (!searches.length) return [];
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const search of searches) {
      const query = plainToInstance(ListPublicCatalogQueryModel, {
        search,
        pageNumber: 1,
        pageSize: 6,
        sort: 'newest',
      });
      const result = await this.catalogue.getCatalogBySlug(user.catalogSlug, query);
      for (const item of result.catalog?.items ?? []) {
        const key = item.id ?? item.itemName;
        if (seen.has(key) || lines.length >= 8) continue;
        seen.add(key);
        const weight = item.netWeight ?? item.grossWeight;
        const parts = [
          [item.metalType, item.purity].filter(Boolean).join(' '),
          weight ? `${weight} g` : '',
          item.size ? `size ${item.size}` : '',
          item.hallmarked ? 'hallmarked' : '',
        ].filter(Boolean);
        const price = item.sellingPrice ? `₹${money(item.sellingPrice)}` : 'price on request';
        lines.push(`${item.itemName}${parts.length ? ` (${parts.join(', ')})` : ''}: ${price}`);
      }
      if (!result.catalog?.items?.length) lines.push(`No "${search}" pieces are listed in the catalogue right now.`);
    }
    return lines;
  }

  /** The sender's own records: their WhatsApp number must match the shop's customer record. */
  private async accountFacts(
    userId: string,
    whatsappNumber: string,
  ): Promise<{ lines: string[]; customerId: string | null; customerName: string | null }> {
    const digits = whatsappNumber.replace(/\D/g, '').slice(-10);
    const customer = digits.length === 10 ? await this.customers.findByMobile(digits, userId) : null;
    if (!customer) {
      return {
        lines: [
          'No customer record matches this WhatsApp number — hand over any question about loans, dues or orders.',
        ],
        customerId: null,
        customerName: null,
      };
    }
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    const lines = [`Customer: ${name || 'on record'}`];
    const loans = (await this.loans.findByCustomerId(customer.id)).filter((loan) => loan.status === ELoanStatus.OPEN);
    for (const loan of loans.slice(0, 5)) {
      const interest =
        `${loan.interestPercentage}% ${String(loan.interestType ?? '').toLowerCase() || 'interest'}`.trim();
      lines.push(
        `Open loan from ${loan.createdAt ? day(new Date(loan.createdAt)) : 'earlier'}: principal remaining ` +
          `₹${money(loan.amountRemaining)}, interest remaining ₹${money(loan.interestRemaining)} (${interest} interest)`,
      );
      const unpaid = await this.dues.findByLoanIdAndType(loan.id, [
        EDueType.UPCOMING_DUE,
        EDueType.OVERDUE,
        EDueType.PAST_DUE,
      ]);
      const next = unpaid.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
      if (next) {
        const late = next.type === EDueType.OVERDUE || next.type === EDueType.PAST_DUE;
        lines.push(
          `  Next payment: ₹${money(next.dueAmount)} due ${day(new Date(next.dueDate))}${late ? ' (overdue)' : ''}`,
        );
      }
    }
    if (!loans.length) lines.push('No open loans.');
    const orders = await this.orders.list({ createdBy: userId, customerId: customer.id, page: 1, limit: 5 });
    const active = (orders.items ?? []).filter(
      (order) => order.status !== EOrderStatus.CANCELLED && order.status !== EOrderStatus.COMPLETED,
    );
    for (const order of active.slice(0, 3)) {
      const bits = [
        `status ${String(order.status ?? '')
          .toLowerCase()
          .replace(/_/g, ' ')}`,
        order.dueDate ? `expected ${day(new Date(order.dueDate))}` : '',
        order.totalAmount ? `total ₹${money(order.totalAmount)}` : '',
        order.paidAmount ? `paid ₹${money(order.paidAmount)}` : '',
      ].filter(Boolean);
      lines.push(
        `Order ${order.orderNumber ?? ''}${order.title ? ` "${order.title}"` : ''}: ${bits.join(', ')}`.trim(),
      );
    }
    if (!active.length) lines.push('No open orders.');
    return { lines, customerId: customer.id, customerName: name || null };
  }

  private skip<T>(section: string, err: unknown, fallback: T): T {
    this.logger.warn({ section, err: (err as Error)?.message }, 'Inbox knowledge section unavailable');
    return fallback;
  }
}

function money(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  return amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function day(date: Date): string {
  return Number.isNaN(date.getTime())
    ? 'unknown date'
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
