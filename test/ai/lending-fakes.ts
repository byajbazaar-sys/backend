/* In-memory stand-ins for ByajBazaar's customers, loans, payments, dues and deposits (same contracts as the adapters). */
import { randomUUID } from 'node:crypto';

import {
  AiBusinessError,
  AiCustomer,
  AiCustomerCreateInput,
  AiDepositAccount,
  AiDepositAddInput,
  AiDepositEntry,
  AiDue,
  AiLoan,
  AiLoanCreateInput,
  AiLoanPayment,
  AiPaymentInput,
  AiPreferences,
  AiProgressEvent,
  DEFAULT_AI_PREFERENCES,
  IAiCustomersGateway,
  IAiDepositsGateway,
  IAiLoansGateway,
  IAiPreferencesRepository,
  IAiProgressNotifier,
} from '../../src/ai/application';

type Owned<T> = T & { shopId: string };

export class MemoryCustomers implements IAiCustomersGateway {
  readonly rows: Owned<AiCustomer>[] = [];
  readonly created: AiCustomerCreateInput[] = [];

  add(shopId: string, c: Partial<AiCustomer> & { firstName: string }): AiCustomer {
    const row = { id: randomUUID(), lastName: null, phone: null, location: null, ...c, shopId };
    this.rows.push(row);
    return row;
  }
  async search(shopId: string, text: string | undefined, limit: number) {
    const words = (text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const items = this.rows.filter(
      (c) =>
        c.shopId === shopId &&
        words.every((w) => `${c.firstName} ${c.lastName ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(w)),
    );
    return { total: items.length, items: items.slice(0, limit) };
  }
  async get(shopId: string, id: string) {
    return this.rows.find((c) => c.id === id && c.shopId === shopId) ?? null;
  }
  async create(shopId: string, input: AiCustomerCreateInput) {
    this.created.push(input);
    return this.add(shopId, { ...input });
  }
}

export class MemoryLoans implements IAiLoansGateway {
  readonly loans: Owned<AiLoan>[] = [];
  readonly payments: (AiLoanPayment & { shopId: string })[] = [];
  readonly created: AiLoanCreateInput[] = [];
  readonly recorded: { input: AiPaymentInput; expectedLoanVersion: number | null }[] = [];
  readonly itemTypes = [
    { id: '55555555-5555-4555-8555-555555555551', name: 'Payal' },
    { id: '55555555-5555-4555-8555-555555555552', name: 'Gold Chain' },
  ];

  add(shopId: string, loan: Partial<AiLoan> & { customerId: string }): AiLoan {
    const row: Owned<AiLoan> = {
      id: randomUUID(),
      customerName: null,
      status: 'Open',
      amountRemaining: 10000,
      amountPaid: 0,
      interestRemaining: 400,
      interestPaid: 0,
      interestPercentage: 2,
      interestType: 'Monthly',
      tenureValue: 12,
      tenureType: 'Months',
      version: 1,
      createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      items: [{ name: 'Payal', netWeight: 20, grossWeight: 20, amount: 10000 }],
      ...loan,
      shopId,
    };
    this.loans.push(row);
    return row;
  }
  async list(shopId: string, q: { customerId?: string; status?: string; limit: number }) {
    const items = this.loans.filter(
      (l) =>
        l.shopId === shopId && (!q.customerId || l.customerId === q.customerId) && (!q.status || l.status === q.status),
    );
    return { total: items.length, items: items.slice(0, q.limit) };
  }
  async get(shopId: string, id: string) {
    return this.loans.find((l) => l.id === id && l.shopId === shopId) ?? null;
  }
  async pledgeItemTypes() {
    return this.itemTypes;
  }
  async create(shopId: string, input: AiLoanCreateInput) {
    this.created.push(input);
    const principal = input.loanItems.reduce((s, i) => s + i.amount, 0);
    return this.add(shopId, {
      customerId: input.customerId,
      amountRemaining: principal,
      interestRemaining: 0,
      createdAt: new Date().toISOString(),
      items: input.loanItems.map((i) => ({
        name: i.itemName,
        netWeight: i.netWeightInGrams,
        grossWeight: i.grossWeightInGrams,
        amount: i.amount,
      })),
    });
  }
  async recentPayments(shopId: string, loanId: string, limit: number) {
    return this.payments
      .filter((p) => p.shopId === shopId && p.loanId === loanId)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, limit);
  }
  /** Another member records a payment directly (not through the assistant). */
  recordElsewhere(shopId: string, p: Omit<AiLoanPayment, 'id'>): void {
    this.payments.push({ ...p, id: randomUUID(), shopId });
    const loan = this.loans.find((l) => l.id === p.loanId)!;
    loan.version = (loan.version ?? 0) + 1;
  }
  async recordPayment(shopId: string, input: AiPaymentInput, expectedLoanVersion: number | null) {
    const loan = this.loans.find((l) => l.id === input.loanId && l.shopId === shopId);
    if (!loan) throw new AiBusinessError('Loan not found', 'NOT_FOUND');
    if (expectedLoanVersion !== null && loan.version !== expectedLoanVersion) {
      throw new AiBusinessError('The loan changed since it was loaded', 'CONFLICT');
    }
    this.recorded.push({ input, expectedLoanVersion });
    const payment = {
      id: randomUUID(),
      loanId: loan.id,
      amount: input.amount,
      transactionType: input.transactionType,
      paidIn: input.paidIn,
      createdAt: new Date().toISOString(),
    };
    this.payments.push({ ...payment, shopId });
    loan.version = (loan.version ?? 0) + 1;
    if (input.transactionType === 'Interest') loan.interestRemaining -= input.amount;
    else loan.amountRemaining -= input.amount;
    return payment;
  }
  async dues(shopId: string, q: { customerName?: string; types?: string[]; limit: number }) {
    const items: AiDue[] = this.loans
      .filter((l) => l.shopId === shopId && l.status === 'Open' && l.interestRemaining > 0)
      .filter((l) => !q.customerName || (l.customerName ?? '').toLowerCase().includes(q.customerName.toLowerCase()))
      .map((l) => ({
        id: randomUUID(),
        loanId: l.id,
        customerId: l.customerId,
        customerName: l.customerName,
        type: 'OVERDUE',
        dueDate: '2026-11-01T00:00:00.000Z',
        dueAmount: l.interestRemaining,
      }))
      .filter((d) => !q.types || q.types.includes(d.type));
    return { total: items.length, items: items.slice(0, q.limit) };
  }
  async stats(shopId: string) {
    const open = this.loans.filter((l) => l.shopId === shopId && l.status === 'Open');
    return {
      total: open.length,
      open: open.length,
      closed: 0,
      amountRemaining: open.reduce((s, l) => s + l.amountRemaining, 0),
      amountPaid: 0,
      interestRemaining: open.reduce((s, l) => s + l.interestRemaining, 0),
      interestPaid: 0,
      customersCount: new Set(open.map((l) => l.customerId)).size,
      totalNetWeight: 20,
    };
  }
}

export class MemoryDeposits implements IAiDepositsGateway {
  readonly accounts: Owned<AiDepositAccount>[] = [];
  readonly entries: (AiDepositEntry & { accountId: string })[] = [];
  readonly added: { accountId: string; input: AiDepositAddInput }[] = [];

  open(shopId: string, a: Partial<AiDepositAccount> & { customerId: string }): AiDepositAccount {
    const row: Owned<AiDepositAccount> = {
      id: randomUUID(),
      depositNumber: `DEP-${this.accounts.length + 1}`,
      customerName: null,
      name: null,
      status: 'Active',
      currentBalance: 0,
      totalDeposited: 0,
      ...a,
      shopId,
    };
    this.accounts.push(row);
    return row;
  }
  async list(shopId: string, q: { customerId?: string; status?: string; search?: string; limit: number }) {
    const items = this.accounts.filter(
      (a) =>
        a.shopId === shopId &&
        (!q.customerId || a.customerId === q.customerId) &&
        (!q.status || a.status === q.status) &&
        (!q.search || (a.customerName ?? '').toLowerCase().includes(q.search.toLowerCase())),
    );
    return { total: items.length, items: items.slice(0, q.limit) };
  }
  async get(shopId: string, id: string) {
    return this.accounts.find((a) => a.id === id && a.shopId === shopId) ?? null;
  }
  async activeAccountFor(shopId: string, customerId: string) {
    return (
      this.accounts.find((a) => a.shopId === shopId && a.customerId === customerId && a.status === 'Active') ??
      this.open(shopId, { customerId })
    );
  }
  depositElsewhere(accountId: string, amount: number, paymentMode: string): void {
    this.entries.push({
      id: randomUUID(),
      accountId,
      type: 'Deposit',
      amount,
      paymentMode,
      createdAt: new Date(Date.now() + 1000).toISOString(),
    });
  }
  async add(shopId: string, accountId: string, input: AiDepositAddInput) {
    const account = this.accounts.find((a) => a.id === accountId && a.shopId === shopId)!;
    this.added.push({ accountId, input });
    this.entries.push({
      id: randomUUID(),
      accountId,
      type: 'Deposit',
      amount: input.amount,
      paymentMode: input.paymentMode,
      createdAt: new Date().toISOString(),
    });
    account.currentBalance += input.amount;
    account.totalDeposited += input.amount;
    return account;
  }
  async ledger(_shopId: string, accountId: string, limit: number) {
    return this.entries
      .filter((e) => e.accountId === accountId)
      .slice(-limit)
      .reverse();
  }
  async stats(shopId: string) {
    const mine = this.accounts.filter((a) => a.shopId === shopId);
    return {
      totalDeposits: mine.reduce((s, a) => s + a.totalDeposited, 0),
      activeAccounts: mine.filter((a) => a.status === 'Active').length,
      totalBalance: mine.reduce((s, a) => s + a.currentBalance, 0),
    };
  }
}

export class MemoryPreferences implements IAiPreferencesRepository {
  readonly rows = new Map<string, AiPreferences>();
  async get(actorUserId: string) {
    return this.rows.get(actorUserId) ?? { ...DEFAULT_AI_PREFERENCES };
  }
  async save(actorUserId: string, prefs: Pick<AiPreferences, 'language' | 'replyStyle'>) {
    const row = { ...prefs, updatedAt: new Date() };
    this.rows.set(actorUserId, row);
    return row;
  }
}

export class MemoryProgress implements IAiProgressNotifier {
  readonly events: (AiProgressEvent & { shopId: string; actorUserId: string })[] = [];
  async notify(target: { shopId: string; actorUserId: string }, event: AiProgressEvent) {
    this.events.push({ ...target, ...event });
  }
}
