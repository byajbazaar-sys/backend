import { z } from 'zod';

import {
  compact,
  customerName,
  customerRef,
  DUPLICATE_WINDOW_MS,
  dueRow,
  inr,
  isoDay,
  istTime,
  loanRow,
  paymentRow,
  recordsCard,
  resolveCustomer,
  rupees,
  sameAmount,
} from './lending-shared';
import { AiBusinessError, EAiIntent } from '../../domain';
import { AiCustomer, AiLoan, AiPledgeItemType, IAiCustomersGateway, IAiLoansGateway } from '../../ports';
import { AiReadTool, AiToolContext, AiToolOutcome, AiWriteTool } from '../ai-tool';
import { roundGrams, titleCase } from '../inventory/inventory-terms';

const LOAN_STATUS = { OPEN: 'Open', CLOSED: 'Closed' } as const;
const PAYMENT_TYPES = { INTEREST: 'Interest', PRINCIPAL: 'Principal' } as const;
const PAID_IN = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank Transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
} as const;
const INTEREST_TYPES = { MONTHLY: 'Monthly', DAILY: 'Daily' } as const;
const METHODS = { SIMPLE: 'Simple', COMPOUND: 'Compound' } as const;
const TENURE_UNITS = { DAYS: 'Days', MONTHS: 'Months', YEARS: 'Years' } as const;
const DUE_TYPES = { OVERDUE: ['OVERDUE'], UPCOMING: ['UPCOMING_DUE'], PAST_DUE: ['PAST_DUE'] } as const;

const keysOf = <T extends Record<string, unknown>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

/** Loan data the model may see: amounts and ids, no documents or signatures. */
const loanForModel = (l: AiLoan) => ({
  id: l.id,
  customerId: l.customerId,
  customer: l.customerName,
  status: l.status,
  principalDue: l.amountRemaining,
  interestDue: l.interestRemaining,
  principalPaid: l.amountPaid,
  interestPaid: l.interestPaid,
  rate: `${l.interestPercentage}% ${l.interestType === 'Daily' ? 'per day' : 'per month'}`,
  startedOn: l.createdAt?.slice(0, 10) ?? null,
  items: l.items.map((i) => `${i.name}${i.netWeight ? ` ${i.netWeight} g` : ''}`),
});

const loose = z.looseObject({ id: z.string() });

// ------------------------------------------------------------------ loans.search

const searchInput = z.strictObject({
  ...customerRef,
  status: z.enum(keysOf(LOAN_STATUS)).optional().describe('OPEN or CLOSED. Leave out for all.'),
  limit: z.number().int().min(1).max(20).optional().describe('How many to show (default 10).'),
});
type SearchInput = z.infer<typeof searchInput>;

export function loansSearchTool(customers: IAiCustomersGateway, loans: IAiLoansGateway): AiReadTool<SearchInput> {
  return {
    action: 'loans.search',
    intent: EAiIntent.Search,
    description:
      "List loans (girvi) — one customer's, or the shop's recent ones — with principal and interest still due.",
    input: searchInput,
    output: z.object({ total: z.number(), loans: z.array(loose) }),
    permission: { module: 'loans', level: 'view' },
    confirmation: 'never',

    async run(input: SearchInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      let customer: AiCustomer | undefined;
      const resolved = await resolveCustomer(customers, ctx.actor.shopId, input);
      if (resolved?.kind === 'outcome') return resolved.outcome;
      if (resolved?.kind === 'found') customer = resolved.customer;
      const { total, items } = await loans.list(ctx.actor.shopId, {
        customerId: customer?.id,
        status: input.status ? LOAN_STATUS[input.status] : undefined,
        limit: input.limit ?? 10,
      });
      const who = customer ? `${customerName(customer)}'s loans` : 'Loans';
      return {
        kind: 'result',
        data: { total, loans: items.map(loanForModel) },
        card: recordsCard(
          'loan',
          input.status === 'CLOSED' ? `${who} (closed)` : who,
          total,
          items.map(loanRow),
          '/loans',
        ),
      };
    },
  };
}

// ------------------------------------------------------------------ dues.list

const duesInput = z.strictObject({
  customer: z.string().min(2).max(80).optional().describe('Customer name, to see only their dues.'),
  type: z.enum(keysOf(DUE_TYPES)).optional().describe('OVERDUE, UPCOMING or PAST_DUE. Leave out for all unpaid.'),
  limit: z.number().int().min(1).max(20).optional(),
});
type DuesInput = z.infer<typeof duesInput>;

export function duesListTool(loans: IAiLoansGateway): AiReadTool<DuesInput> {
  return {
    action: 'dues.list',
    intent: EAiIntent.Query,
    description: 'Unpaid loan dues (overdue, upcoming, past due) — all, or one customer’s.',
    input: duesInput,
    output: z.object({ total: z.number(), dues: z.array(loose) }),
    permission: { module: 'loans', level: 'view' },
    confirmation: 'never',

    async run(input: DuesInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      const types = input.type ? [...DUE_TYPES[input.type]] : ['OVERDUE', 'PAST_DUE', 'UPCOMING_DUE'];
      const { total, items } = await loans.dues(ctx.actor.shopId, {
        customerName: input.customer?.trim(),
        types,
        limit: input.limit ?? 10,
      });
      return {
        kind: 'result',
        data: {
          total,
          dues: items.map((d) => ({
            id: d.id,
            loanId: d.loanId,
            customer: d.customerName,
            type: d.type,
            dueDate: d.dueDate?.slice(0, 10) ?? null,
            amount: d.dueAmount,
          })),
        },
        card: recordsCard(
          'due',
          input.type === 'OVERDUE' ? 'Overdue' : input.type === 'UPCOMING' ? 'Upcoming dues' : 'Dues',
          total,
          items.map(dueRow),
          '/dues',
        ),
      };
    },
  };
}

// ------------------------------------------------------------------ loans.create

const loanItemInput = z.strictObject({
  name: z.string().min(1).max(80).describe('The pledged ornament, e.g. "Payal", "Chain".'),
  netWeight: z.number().positive().max(100_000).optional().describe('Net weight in grams.'),
  grossWeight: z.number().positive().max(100_000).optional().describe('Gross weight in grams.'),
  amount: rupees('Loan amount against this item').optional(),
});

const createInput = z.strictObject({
  ...customerRef,
  items: z.array(loanItemInput).max(10).optional().describe('The ornaments pledged (girvi), one entry each.'),
  amount: rupees('Total loan amount, when there is one item or the person gave only a total').optional(),
  interestRate: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Interest percent per period, e.g. 2 for "2 rupaye saikda" (2% a month).'),
  interestPeriod: z.enum(keysOf(INTEREST_TYPES)).optional().describe('MONTHLY (default) or DAILY.'),
  interestMethod: z.enum(keysOf(METHODS)).optional().describe('SIMPLE (default) or COMPOUND.'),
  tenure: z.number().int().positive().max(1200).optional().describe('Loan term, e.g. 12.'),
  tenureUnit: z.enum(keysOf(TENURE_UNITS)).optional().describe('MONTHS, DAYS or YEARS.'),
  startDate: isoDay.optional(),
});
type CreateInput = z.infer<typeof createInput>;

const createParams = z.strictObject({
  customerId: z.uuid(),
  customerName: z.string(),
  tenureType: z.enum(Object.values(TENURE_UNITS)),
  tenureValue: z.number().int().positive(),
  interestPercentage: z.number().min(0).max(100),
  interestType: z.enum(Object.values(INTEREST_TYPES)),
  interestCalculationMethod: z.enum(Object.values(METHODS)),
  startDate: isoDay.optional(),
  loanItems: z
    .array(
      z.strictObject({
        itemId: z.uuid(),
        itemName: z.string().min(1),
        amount: z.number().positive(),
        netWeightInGrams: z.number().positive(),
        grossWeightInGrams: z.number().positive(),
      }),
    )
    .min(1)
    .max(10),
  /** When the preview was made: a loan saved after it for the same customer and amount is a duplicate. */
  preparedAt: z.iso.datetime(),
});
type CreateParams = z.infer<typeof createParams>;

const total = (p: Pick<CreateParams, 'loanItems'>) => p.loanItems.reduce((sum, i) => sum + i.amount, 0);

function matchItemType(types: AiPledgeItemType[], name: string): AiPledgeItemType | null {
  const wanted = name.trim().toLowerCase();
  return (
    types.find((t) => t.name.trim().toLowerCase() === wanted) ??
    types.find((t) => t.name.toLowerCase().includes(wanted) || wanted.includes(t.name.toLowerCase())) ??
    null
  );
}

export function loansCreateTool(
  customers: IAiCustomersGateway,
  loans: IAiLoansGateway,
): AiWriteTool<CreateInput, CreateParams> {
  return {
    action: 'loans.create',
    intent: EAiIntent.Create,
    description:
      'Prepare a new gold / silver loan (girvi) for the person to confirm — nothing is saved until they tap Confirm. ' +
      'Needs the customer, each pledged item with its weight, the amount, the interest rate and the term. Leave out ' +
      'anything the person did not say; the tool reports what is missing.',
    input: createInput,
    parameters: createParams,
    output: loose,
    permission: { module: 'loans', level: 'edit' },
    confirmation: 'required',

    async prepare(input: CreateInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      const shopId = ctx.actor.shopId;
      const items = input.items ?? [];
      const missing: { field: string; question: string }[] = [];
      if (!input.customerId && !input.customer)
        missing.push({ field: 'customer', question: 'Which customer is the loan for?' });
      if (!items.length)
        missing.push({ field: 'items', question: 'Which ornaments are pledged, and their weight in grams?' });
      if (items.some((i) => i.netWeight === undefined && i.grossWeight === undefined)) {
        missing.push({ field: 'items.netWeight', question: 'What is the weight (grams) of each pledged item?' });
      }
      const amounts = items.map((i) => i.amount);
      if (items.length && amounts.some((a) => a === undefined) && !(items.length === 1 && input.amount)) {
        missing.push({
          field: 'amount',
          question: items.length > 1 ? 'How much loan against each item?' : 'What is the loan amount?',
        });
      }
      if (input.interestRate === undefined)
        missing.push({ field: 'interestRate', question: 'What interest rate (e.g. 2% a month)?' });
      if (input.tenure === undefined || !input.tenureUnit) {
        missing.push({ field: 'tenure', question: 'For how long — how many months?' });
      }
      if (missing.length) return { kind: 'needs_input', missing, known: compact({ ...input }) };

      const resolved = await resolveCustomer(customers, shopId, input);
      if (!resolved) return { kind: 'rejected', message: 'Say which customer the loan is for.' };
      if (resolved.kind === 'outcome') return resolved.outcome;
      const customer = resolved.customer;

      const types = await loans.pledgeItemTypes(shopId);
      const warnings: string[] = [];
      const loanItems: CreateParams['loanItems'] = [];
      for (const item of items) {
        const type = matchItemType(types, item.name);
        if (!type) {
          return {
            kind: 'ambiguous',
            message: `"${item.name}" is not in the shop's item list. Ask which of these it is, or to add it in Items first.`,
            candidates: types.slice(0, 20).map((t) => t.name),
          };
        }
        const net = item.netWeight ?? item.grossWeight;
        const gross = item.grossWeight ?? item.netWeight;
        if (net > gross)
          return { kind: 'rejected', message: `${type.name}: net weight cannot be more than gross weight.` };
        if (item.netWeight === undefined || item.grossWeight === undefined) {
          warnings.push(
            `${type.name}: only one weight was given, so net and gross weight are both ${roundGrams(net)} g.`,
          );
        }
        loanItems.push({
          itemId: type.id,
          itemName: titleCase(type.name),
          amount: item.amount ?? input.amount,
          netWeightInGrams: roundGrams(net),
          grossWeightInGrams: roundGrams(gross),
        });
      }
      if (input.amount && items.length > 1 && !sameAmount(input.amount, total({ loanItems }))) {
        return {
          kind: 'rejected',
          message: `The item amounts add up to ${inr(total({ loanItems }))}, not ${inr(input.amount)}. Ask which is right.`,
        };
      }
      if (input.startDate && input.startDate > ctx.now.toISOString().slice(0, 10)) {
        return { kind: 'rejected', message: 'The start date cannot be in the future.' };
      }

      const parameters = compact<CreateParams>({
        customerId: customer.id,
        customerName: customerName(customer),
        tenureType: TENURE_UNITS[input.tenureUnit],
        tenureValue: input.tenure,
        interestPercentage: input.interestRate,
        interestType: INTEREST_TYPES[input.interestPeriod ?? 'MONTHLY'],
        interestCalculationMethod: METHODS[input.interestMethod ?? 'SIMPLE'],
        startDate: input.startDate,
        loanItems,
        preparedAt: ctx.now.toISOString(),
      });
      const principal = total(parameters);

      const open = await loans.list(shopId, { customerId: customer.id, status: 'Open', limit: 20 });
      const twin = open.items.find(
        (l) =>
          sameAmount(l.amountRemaining + l.amountPaid, principal) &&
          l.createdAt &&
          ctx.now.getTime() - new Date(l.createdAt).getTime() < DUPLICATE_WINDOW_MS,
      );
      if (twin) {
        warnings.push(
          `${parameters.customerName} already got a ${inr(principal)} loan ${istTime(twin.createdAt)}. Is this a new one?`,
        );
      }

      return {
        kind: 'proposal',
        parameters,
        preview: {
          entity: 'loan',
          mode: 'create',
          title: 'New loan',
          summary: `${inr(principal)} loan for ${parameters.customerName} at ${parameters.interestPercentage}% ${parameters.interestType === 'Daily' ? 'a day' : 'a month'}`,
          fields: [
            { key: 'customer', label: 'Customer', value: parameters.customerName },
            {
              key: 'items',
              label: 'Pledged',
              value: loanItems
                .map((i) => `${i.itemName} ${i.netWeightInGrams} g${loanItems.length > 1 ? ` (${inr(i.amount)})` : ''}`)
                .join(', '),
            },
            { key: 'amount', label: 'Loan amount', value: inr(principal) },
            {
              key: 'interest',
              label: 'Interest',
              value: `${parameters.interestPercentage}% ${parameters.interestType === 'Daily' ? 'per day' : 'per month'}, ${parameters.interestCalculationMethod.toLowerCase()}`,
            },
            { key: 'tenure', label: 'Term', value: `${parameters.tenureValue} ${parameters.tenureType.toLowerCase()}` },
            { key: 'startDate', label: 'Start date', value: parameters.startDate ?? 'Today' },
          ],
          warnings,
        },
      };
    },

    async execute(parameters: CreateParams, ctx: AiToolContext) {
      const shopId = ctx.actor.shopId;
      const principal = total(parameters);
      const since = new Date(parameters.preparedAt).getTime();
      const recent = await loans.list(shopId, { customerId: parameters.customerId, status: 'Open', limit: 20 });
      if (
        recent.items.some(
          (l) =>
            l.createdAt &&
            new Date(l.createdAt).getTime() > since &&
            sameAmount(l.amountRemaining + l.amountPaid, principal),
        )
      ) {
        throw new AiBusinessError(
          `A ${inr(principal)} loan for ${parameters.customerName} was already saved after this preview, so a second one was not made. Ask again if you really need another.`,
          'CONFLICT',
        );
      }
      const name = parameters.customerName;
      const input = compact({
        customerId: parameters.customerId,
        tenureType: parameters.tenureType,
        tenureValue: parameters.tenureValue,
        interestPercentage: parameters.interestPercentage,
        interestType: parameters.interestType,
        interestCalculationMethod: parameters.interestCalculationMethod,
        startDate: parameters.startDate,
        loanItems: parameters.loanItems,
      });
      const loan = await loans.create(shopId, input);
      return {
        summary: `Saved a ${inr(principal)} loan for ${name}.`,
        data: { id: loan.id },
        card: recordsCard('loan', 'Loan', 1, [loanRow({ ...loan, customerName: loan.customerName ?? name })]),
        entityType: 'loan',
        entityId: loan.id,
      };
    },
  };
}

// ------------------------------------------------------------------ payments.record

const paymentInput = z.strictObject({
  loanId: z.uuid().optional().describe('Loan id, when it came from an earlier result in this conversation.'),
  ...customerRef,
  amount: rupees('Amount received').optional(),
  paymentType: z.enum(keysOf(PAYMENT_TYPES)).optional().describe('INTEREST (byaj) or PRINCIPAL (mool / asal).'),
  paidIn: z.enum(keysOf(PAID_IN)).optional().describe('CASH, UPI, BANK_TRANSFER, CHEQUE or CARD.'),
  paidOn: isoDay.optional(),
});
type PaymentInput = z.infer<typeof paymentInput>;

const paymentParams = z.strictObject({
  loanId: z.uuid(),
  customerName: z.string(),
  amount: z.number().positive(),
  transactionType: z.enum(Object.values(PAYMENT_TYPES)),
  paidIn: z.enum(Object.values(PAID_IN)),
  paidAt: isoDay.optional(),
  /** The loan as previewed: if it changed since (another payment, an edit) the payment is not saved. */
  expectedLoanVersion: z.number().int().min(0).nullable(),
  preparedAt: z.iso.datetime(),
});
type PaymentParams = z.infer<typeof paymentParams>;

export function paymentsRecordTool(
  customers: IAiCustomersGateway,
  loans: IAiLoansGateway,
): AiWriteTool<PaymentInput, PaymentParams> {
  return {
    action: 'payments.record',
    intent: EAiIntent.Create,
    description:
      'Prepare an interest (byaj) or principal payment received on a loan, for the person to confirm — nothing is ' +
      'saved until they tap Confirm. Needs the loan (or its customer), the amount, interest or principal, and how ' +
      'it was paid. Leave out anything the person did not say.',
    input: paymentInput,
    parameters: paymentParams,
    output: loose,
    permission: { module: 'loans', level: 'edit' },
    confirmation: 'required',

    async prepare(input: PaymentInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      const shopId = ctx.actor.shopId;
      const missing: { field: string; question: string }[] = [];
      if (!input.loanId && !input.customerId && !input.customer) {
        missing.push({ field: 'customer', question: 'Whose loan is the payment for?' });
      }
      if (input.amount === undefined) missing.push({ field: 'amount', question: 'How much was paid?' });
      if (!input.paymentType) missing.push({ field: 'paymentType', question: 'Is it interest (byaj) or principal?' });
      if (!input.paidIn)
        missing.push({ field: 'paidIn', question: 'Paid in cash, UPI, bank transfer, cheque or card?' });
      if (missing.length) return { kind: 'needs_input', missing, known: compact({ ...input }) };

      let loan: AiLoan | null = null;
      if (input.loanId) {
        loan = await loans.get(shopId, input.loanId);
        if (!loan) return { kind: 'rejected', message: 'That loan was not found in this shop.' };
      } else {
        const resolved = await resolveCustomer(customers, shopId, input);
        if (!resolved) return { kind: 'rejected', message: 'Say whose loan the payment is for.' };
        if (resolved.kind === 'outcome') return resolved.outcome;
        const open = await loans.list(shopId, { customerId: resolved.customer.id, status: 'Open', limit: 10 });
        if (!open.items.length) {
          return { kind: 'rejected', message: `${customerName(resolved.customer)} has no open loan.` };
        }
        if (open.items.length > 1) {
          return {
            kind: 'ambiguous',
            message: `${customerName(resolved.customer)} has ${open.items.length} open loans. Ask which one (amount, items, start date).`,
            candidates: open.items.map(loanForModel),
            card: recordsCard(
              'loan',
              `${customerName(resolved.customer)}'s open loans`,
              open.total,
              open.items.map(loanRow),
            ),
          };
        }
        loan = open.items[0];
      }
      if (loan.status !== 'Open')
        return { kind: 'rejected', message: 'That loan is closed; payments cannot be added.' };

      const amount = Math.round(input.amount * 100) / 100;
      const type = PAYMENT_TYPES[input.paymentType];
      if (type === 'Principal' && amount > loan.amountRemaining + 0.005) {
        return {
          kind: 'rejected',
          message: `Principal still due is ${inr(loan.amountRemaining)}; ${inr(amount)} is more than that.`,
        };
      }
      if (input.paidOn && input.paidOn > ctx.now.toISOString().slice(0, 10)) {
        return { kind: 'rejected', message: 'The payment date cannot be in the future.' };
      }

      const warnings: string[] = [];
      if (type === 'Interest' && amount > loan.interestRemaining + 0.005) {
        warnings.push(`Interest due right now is ${inr(loan.interestRemaining)}; this is more than that.`);
      }
      // Duplicate-payment check: the same amount and type on this loan in the last 24 hours.
      const recent = await loans.recentPayments(shopId, loan.id, 10);
      const twin = recent.find(
        (p) =>
          p.transactionType === type &&
          sameAmount(p.amount, amount) &&
          p.createdAt &&
          ctx.now.getTime() - new Date(p.createdAt).getTime() < DUPLICATE_WINDOW_MS,
      );
      if (twin) {
        warnings.push(
          `A ${inr(amount)} ${type.toLowerCase()} payment on this loan was already recorded ${istTime(twin.createdAt)}. Make sure this is a new payment.`,
        );
      }

      const name = loan.customerName ?? 'the customer';
      const parameters = compact<PaymentParams>({
        loanId: loan.id,
        customerName: name,
        amount,
        transactionType: type,
        paidIn: PAID_IN[input.paidIn],
        paidAt: input.paidOn,
        expectedLoanVersion: loan.version,
        preparedAt: ctx.now.toISOString(),
      });
      return {
        kind: 'proposal',
        parameters: { ...parameters, expectedLoanVersion: loan.version },
        preview: {
          entity: 'payment',
          mode: 'create',
          title: type === 'Interest' ? 'Interest payment' : 'Principal payment',
          summary: `${inr(amount)} ${type.toLowerCase()} from ${name} (${parameters.paidIn})`,
          fields: [
            { key: 'customer', label: 'Customer', value: name },
            { key: 'amount', label: 'Amount', value: inr(amount) },
            { key: 'type', label: 'For', value: type },
            { key: 'paidIn', label: 'Paid in', value: parameters.paidIn },
            { key: 'paidAt', label: 'Date', value: parameters.paidAt ?? 'Today' },
            { key: 'principalDue', label: 'Principal due now', value: inr(loan.amountRemaining) },
            { key: 'interestDue', label: 'Interest due now', value: inr(loan.interestRemaining) },
          ],
          warnings,
        },
      };
    },

    async execute(parameters: PaymentParams, ctx: AiToolContext) {
      const shopId = ctx.actor.shopId;
      const since = new Date(parameters.preparedAt).getTime();
      const recent = await loans.recentPayments(shopId, parameters.loanId, 10);
      if (
        recent.some(
          (p) =>
            p.transactionType === parameters.transactionType &&
            sameAmount(p.amount, parameters.amount) &&
            p.createdAt &&
            new Date(p.createdAt).getTime() > since,
        )
      ) {
        throw new AiBusinessError(
          `A ${inr(parameters.amount)} ${parameters.transactionType.toLowerCase()} payment on this loan was recorded after this preview, so it was not saved twice.`,
          'CONFLICT',
        );
      }
      const payment = await loans.recordPayment(
        shopId,
        {
          loanId: parameters.loanId,
          amount: parameters.amount,
          transactionType: parameters.transactionType,
          paidIn: parameters.paidIn,
          paidAt: parameters.paidAt,
        },
        parameters.expectedLoanVersion,
      );
      return {
        summary: `Recorded ${inr(payment.amount)} ${parameters.transactionType.toLowerCase()} from ${parameters.customerName} (${parameters.paidIn}).`,
        data: { id: payment.id },
        card: recordsCard('payment', 'Payment', 1, [paymentRow(payment, parameters.customerName)]),
        entityType: 'transaction',
        entityId: payment.id,
      };
    },
  };
}

export const loansTools = (customers: IAiCustomersGateway, loans: IAiLoansGateway) => [
  loansSearchTool(customers, loans),
  duesListTool(loans),
  loansCreateTool(customers, loans),
  paymentsRecordTool(customers, loans),
];
