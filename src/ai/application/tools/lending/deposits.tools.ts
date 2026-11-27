import { z } from 'zod';

import {
  compact,
  customerName,
  customerRef,
  DUPLICATE_WINDOW_MS,
  depositRow,
  inr,
  istTime,
  recordsCard,
  resolveCustomer,
  rupees,
  sameAmount,
} from './lending-shared';
import { AiBusinessError, EAiIntent } from '../../domain';
import {
  AiDepositAccount,
  IAiCustomersGateway,
  IAiDepositsGateway,
  IAiInventoryGateway,
  IAiLoansGateway,
} from '../../ports';
import { AiReadTool, AiToolContext, AiToolOutcome, AiWriteTool } from '../ai-tool';

const DEPOSIT_STATUS = { ACTIVE: 'Active', CLOSED: 'Closed', REFUNDED: 'Refunded' } as const;
const PAID_IN = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank Transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
} as const;
const keysOf = <T extends Record<string, unknown>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const loose = z.looseObject({ id: z.string() });

const depositForModel = (a: AiDepositAccount) => ({
  id: a.id,
  number: a.depositNumber,
  customer: a.customerName,
  status: a.status,
  balance: a.currentBalance,
  totalDeposited: a.totalDeposited,
});

// ------------------------------------------------------------------ deposits.search

const searchInput = z.strictObject({
  customer: z.string().min(1).max(80).optional().describe('Customer name, phone or deposit number.'),
  status: z.enum(keysOf(DEPOSIT_STATUS)).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});
type SearchInput = z.infer<typeof searchInput>;

export function depositsSearchTool(deposits: IAiDepositsGateway): AiReadTool<SearchInput> {
  return {
    action: 'deposits.search',
    intent: EAiIntent.Search,
    description: 'Find customer deposit accounts (by customer name, phone or number) with their balance.',
    input: searchInput,
    output: z.object({ total: z.number(), deposits: z.array(loose) }),
    permission: { module: 'loans', level: 'view' },
    confirmation: 'never',

    async run(input: SearchInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      const { total, items } = await deposits.list(ctx.actor.shopId, {
        search: input.customer?.trim(),
        status: input.status ? DEPOSIT_STATUS[input.status] : undefined,
        limit: input.limit ?? 10,
      });
      return {
        kind: 'result',
        data: { total, deposits: items.map(depositForModel) },
        card: recordsCard('deposit', 'Deposits', total, items.map(depositRow), '/deposits'),
      };
    },
  };
}

// ------------------------------------------------------------------ deposits.add

const addInput = z.strictObject({
  depositId: z.uuid().optional().describe('Deposit account id, when it came from an earlier result.'),
  ...customerRef,
  amount: rupees('Amount deposited').optional(),
  paymentMode: z.enum(keysOf(PAID_IN)).optional().describe('CASH, UPI, BANK_TRANSFER, CHEQUE or CARD.'),
  reference: z.string().min(1).max(100).optional().describe('UPI / cheque / bank reference, if given.'),
  remarks: z.string().min(1).max(200).optional(),
});
type AddInput = z.infer<typeof addInput>;

const addParams = z.strictObject({
  /** null: the customer has no active account yet; the deposits service opens one. */
  accountId: z.uuid().nullable(),
  customerId: z.uuid(),
  customerName: z.string(),
  amount: z.number().positive(),
  paymentMode: z.enum(Object.values(PAID_IN)),
  transactionReference: z.string().min(1).max(100).optional(),
  remarks: z.string().min(1).max(200).optional(),
  preparedAt: z.iso.datetime(),
});
type AddParams = z.infer<typeof addParams>;

export function depositsAddTool(
  customers: IAiCustomersGateway,
  deposits: IAiDepositsGateway,
): AiWriteTool<AddInput, AddParams> {
  return {
    action: 'deposits.add',
    intent: EAiIntent.Create,
    description:
      'Prepare money a customer deposits into their deposit account, for the person to confirm — nothing is saved ' +
      'until they tap Confirm. Needs the customer (or deposit id), the amount and how it was paid.',
    input: addInput,
    parameters: addParams,
    output: loose,
    permission: { module: 'loans', level: 'edit' },
    confirmation: 'required',

    async prepare(input: AddInput, ctx: AiToolContext): Promise<AiToolOutcome> {
      const shopId = ctx.actor.shopId;
      const missing: { field: string; question: string }[] = [];
      if (!input.depositId && !input.customerId && !input.customer) {
        missing.push({ field: 'customer', question: 'Which customer is depositing?' });
      }
      if (input.amount === undefined) missing.push({ field: 'amount', question: 'How much is deposited?' });
      if (!input.paymentMode)
        missing.push({ field: 'paymentMode', question: 'Paid in cash, UPI, bank transfer, cheque or card?' });
      if (missing.length) return { kind: 'needs_input', missing, known: compact({ ...input }) };

      let account: AiDepositAccount | null = null;
      let customerId: string;
      let name: string;
      if (input.depositId) {
        account = await deposits.get(shopId, input.depositId);
        if (!account?.customerId)
          return { kind: 'rejected', message: 'That deposit account was not found in this shop.' };
        customerId = account.customerId;
        name = account.customerName ?? 'the customer';
      } else {
        const resolved = await resolveCustomer(customers, shopId, input);
        if (!resolved) return { kind: 'rejected', message: 'Say which customer is depositing.' };
        if (resolved.kind === 'outcome') return resolved.outcome;
        customerId = resolved.customer.id;
        name = customerName(resolved.customer);
        const active = await deposits.list(shopId, { customerId, status: 'Active', limit: 5 });
        if (active.items.length > 1) {
          return {
            kind: 'ambiguous',
            message: `${name} has ${active.items.length} active deposit accounts. Ask which one.`,
            candidates: active.items.map(depositForModel),
            card: recordsCard('deposit', `${name}'s deposits`, active.total, active.items.map(depositRow)),
          };
        }
        account = active.items[0] ?? null;
      }
      const inactive = account ? account.status !== 'Active' : false;
      if (account && inactive) {
        return {
          kind: 'rejected',
          message: `That deposit account is ${account.status?.toLowerCase()}; money cannot be added.`,
        };
      }

      const amount = Math.round(input.amount * 100) / 100;
      const warnings: string[] = [];
      if (!account) warnings.push(`${name} has no active deposit account; a new one will be opened.`);
      else {
        const recent = await deposits.ledger(shopId, account.id, 10);
        const twin = recent.find(
          (e) =>
            e.type === 'Deposit' &&
            sameAmount(e.amount, amount) &&
            e.createdAt &&
            ctx.now.getTime() - new Date(e.createdAt).getTime() < DUPLICATE_WINDOW_MS,
        );
        if (twin)
          warnings.push(
            `${inr(amount)} was already deposited ${istTime(twin.createdAt)}. Make sure this is a new deposit.`,
          );
      }

      const parameters = compact<AddParams>({
        accountId: account?.id ?? null,
        customerId,
        customerName: name,
        amount,
        paymentMode: PAID_IN[input.paymentMode],
        transactionReference: input.reference?.trim(),
        remarks: input.remarks?.trim(),
        preparedAt: ctx.now.toISOString(),
      });
      return {
        kind: 'proposal',
        parameters: { ...parameters, accountId: account?.id ?? null },
        preview: {
          entity: 'deposit',
          mode: 'create',
          title: 'Deposit',
          summary: `${inr(amount)} deposit from ${name} (${parameters.paymentMode})`,
          fields: [
            { key: 'customer', label: 'Customer', value: name },
            {
              key: 'account',
              label: 'Account',
              value: account?.depositNumber ?? (account ? 'Active account' : 'New account'),
            },
            { key: 'amount', label: 'Amount', value: inr(amount) },
            { key: 'paymentMode', label: 'Paid in', value: parameters.paymentMode },
            ...(parameters.transactionReference
              ? [{ key: 'reference', label: 'Reference', value: parameters.transactionReference }]
              : []),
            ...(account ? [{ key: 'balance', label: 'Balance now', value: inr(account.currentBalance) }] : []),
          ],
          warnings,
        },
      };
    },

    async execute(parameters: AddParams, ctx: AiToolContext) {
      const shopId = ctx.actor.shopId;
      let account = parameters.accountId ? await deposits.get(shopId, parameters.accountId) : null;
      if (parameters.accountId && account?.status !== 'Active') {
        throw new AiBusinessError('That deposit account is no longer active.', 'CONFLICT');
      }
      account ??= await deposits.activeAccountFor(shopId, parameters.customerId);
      const since = new Date(parameters.preparedAt).getTime();
      const recent = await deposits.ledger(shopId, account.id, 10);
      if (
        recent.some(
          (e) =>
            e.type === 'Deposit' &&
            sameAmount(e.amount, parameters.amount) &&
            e.paymentMode === parameters.paymentMode &&
            e.createdAt &&
            new Date(e.createdAt).getTime() > since,
        )
      ) {
        throw new AiBusinessError(
          `${inr(parameters.amount)} was deposited into this account after this preview, so it was not added twice.`,
          'CONFLICT',
        );
      }
      const updated = await deposits.add(shopId, account.id, {
        amount: parameters.amount,
        paymentMode: parameters.paymentMode,
        transactionReference: parameters.transactionReference,
        remarks: parameters.remarks,
      });
      return {
        summary: `Deposited ${inr(parameters.amount)} for ${parameters.customerName}. Balance ${inr(updated.currentBalance)}.`,
        data: { id: updated.id },
        card: recordsCard('deposit', 'Deposit', 1, [depositRow(updated)]),
        entityType: 'deposit_account',
        entityId: updated.id,
      };
    },
  };
}

// ------------------------------------------------------------------ reports.overview

const overviewInput = z.strictObject({});

export function reportsOverviewTool(
  inventory: IAiInventoryGateway,
  loans: IAiLoansGateway,
  deposits: IAiDepositsGateway,
): AiReadTool<Record<string, never>> {
  return {
    action: 'reports.overview',
    intent: EAiIntent.Report,
    description:
      'Business overview: open loans and money still due (principal and interest), overdue dues, deposits held and ' +
      'stock value. Use for "business kaisa chal raha hai", "kitna paisa bahar hai", "total outstanding".',
    input: overviewInput,
    output: z.looseObject({}),
    permission: { module: 'reports', level: 'view' },
    confirmation: 'never',

    async run(_input: Record<string, never>, ctx: AiToolContext): Promise<AiToolOutcome> {
      const shopId = ctx.actor.shopId;
      const [loanStats, depositStats, stock, overdue] = await Promise.all([
        loans.stats(shopId),
        deposits.stats(shopId),
        inventory.summary(shopId),
        loans.dues(shopId, { types: ['OVERDUE'], limit: 1 }),
      ]);
      const data = {
        openLoans: loanStats.open,
        closedLoans: loanStats.closed,
        principalDue: loanStats.amountRemaining,
        interestDue: loanStats.interestRemaining,
        interestCollected: loanStats.interestPaid,
        pledgedNetWeightGrams: loanStats.totalNetWeight,
        overdueDues: overdue.total,
        activeDeposits: depositStats.activeAccounts,
        depositBalance: depositStats.totalBalance,
        stockItems: stock.availableItems,
        stockValue: stock.totalValuation,
      };
      return {
        kind: 'result',
        data,
        card: {
          type: 'report',
          title: 'Business overview',
          metrics: [
            { key: 'openLoans', label: 'Open loans', value: data.openLoans, format: 'count' },
            { key: 'principalDue', label: 'Principal due', value: data.principalDue, format: 'currency' },
            { key: 'interestDue', label: 'Interest due', value: data.interestDue, format: 'currency' },
            { key: 'overdue', label: 'Overdue dues', value: data.overdueDues, format: 'count' },
            { key: 'interestPaid', label: 'Interest collected', value: data.interestCollected, format: 'currency' },
            { key: 'pledged', label: 'Gold / silver pledged', value: data.pledgedNetWeightGrams, format: 'weight' },
            { key: 'deposits', label: 'Deposits held', value: data.depositBalance, format: 'currency' },
            { key: 'stock', label: 'Stock value', value: data.stockValue, format: 'currency' },
          ],
        },
      };
    },
  };
}

export const depositsTools = (customers: IAiCustomersGateway, deposits: IAiDepositsGateway) => [
  depositsSearchTool(deposits),
  depositsAddTool(customers, deposits),
];
