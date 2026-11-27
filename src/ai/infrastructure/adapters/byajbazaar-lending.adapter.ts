import { HttpException, Inject, Injectable } from '@nestjs/common';
import { ESortOrder } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import { assertValid, businessCall, num } from './byajbazaar-calls';
import {
  AddDepositAmountRequestModel,
  AddDepositData,
  CreateCustomerRequestModel,
  CreateLoanRequestModel,
  CreateTransactionRequestModel,
  Customer,
  CUSTOMER_SERVICE,
  CustomersFilterOptions,
  DEPOSIT_SERVICE,
  DepositAccount,
  DepositsFilterOptions,
  Due,
  DuesFilterOptions,
  EDueType,
  ELoanStatus,
  ICustomerService,
  IDepositService,
  IItemService,
  ILoanService,
  ITEM_SERVICE,
  ITransactionService,
  Loan,
  LOAN_SERVICE,
  LoansFilterOptions,
  LoanStatsFilterOptions,
  Transaction,
  TRANSACTION_SERVICE,
  TransactionsFilterOptions,
  buildNewLoan,
} from '../../../application';
import {
  AiCustomer,
  AiCustomerCreateInput,
  AiDepositAccount,
  AiDepositAddInput,
  AiDepositEntry,
  AiDepositStats,
  AiDue,
  AiLoan,
  AiLoanCreateInput,
  AiLoanPayment,
  AiLoanStats,
  AiPaymentInput,
  AiPledgeItemType,
  IAiCustomersGateway,
  IAiDepositsGateway,
  IAiLoansGateway,
} from '../../application';

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
const money = (v: unknown): number => num(v) ?? 0;

/** null when the record is not in this shop (the services answer 403 / 404). */
async function orNull<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof HttpException && [403, 404].includes(err.getStatus())) return null;
    throw err;
  }
}

// ------------------------------------------------------------------ customers

const toCustomer = (c: Customer): AiCustomer => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName || null,
  phone: c.phone || null,
  location: c.location || null,
});

/** Customers through ByajBazaar's customer service, with the customers API's request model and rules. */
@Injectable()
export class ByajBazaarCustomersAdapter implements IAiCustomersGateway {
  constructor(@Inject(CUSTOMER_SERVICE) private readonly customers: ICustomerService) {}

  async search(
    shopId: string,
    text: string | undefined,
    limit: number,
  ): Promise<{ total: number; items: AiCustomer[] }> {
    // The service matches one column at a time: search by the first word, then keep full-name matches.
    const words = (text ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const options = plainToInstance(CustomersFilterOptions, {
      createdBy: shopId,
      name: words[0],
      pageNumber: 1,
      pageSize: words.length > 1 ? 50 : Math.min(Math.max(limit, 1), 50),
      sortOrder: ESortOrder.DESC,
      sortField: 'createdAt',
    });
    const paged = await this.customers.getCustomers(options);
    let items = paged.items.map(toCustomer);
    if (words.length > 1) {
      items = items.filter((c) => {
        const name = `${c.firstName} ${c.lastName ?? ''}`.toLowerCase();
        return words.every((w) => name.includes(w));
      });
      return { total: items.length, items: items.slice(0, limit) };
    }
    return { total: paged.totalCount ?? items.length, items };
  }

  async get(shopId: string, id: string): Promise<AiCustomer | null> {
    const customer = await orNull(() => this.customers.getById(id, shopId));
    return customer ? toCustomer(customer) : null;
  }

  async create(shopId: string, input: AiCustomerCreateInput): Promise<AiCustomer> {
    const dto = plainToInstance(CreateCustomerRequestModel, input);
    await assertValid(dto);
    const data = plainToInstance(Customer, dto, { excludeExtraneousValues: true });
    data.createdBy = shopId;
    return toCustomer(await businessCall(() => this.customers.create(data)));
  }
}

// ------------------------------------------------------------------ loans, payments, dues

const toLoan = (l: Loan): AiLoan => ({
  id: l.id,
  customerId: l.customerId,
  customerName: l.customerName ?? null,
  status: l.status,
  amountRemaining: money(l.amountRemaining),
  amountPaid: money(l.amountPaid),
  interestRemaining: money(l.interestRemaining),
  interestPaid: money(l.interestPaid),
  interestPercentage: money(l.interestPercentage),
  interestType: l.interestType,
  tenureValue: money(l.tenureValue),
  tenureType: l.tenureType,
  version: num(l.version),
  createdAt: iso(l.createdAt),
  items: (l.loanItems ?? []).map((i) => ({
    name: i.itemName ?? 'Item',
    netWeight: num(i.netWeightInGrams),
    grossWeight: num(i.grossWeightInGrams),
    amount: num(i.amount),
  })),
});

const toPayment = (t: Transaction): AiLoanPayment => ({
  id: t.id,
  loanId: t.loanId,
  amount: money(t.amount),
  transactionType: t.transactionType,
  paidIn: t.paidIn,
  createdAt: iso(t.createdAt),
});

const toDue = (d: Due): AiDue => ({
  id: d.id ?? '',
  loanId: d.loanId,
  customerId: d.customerId ?? d.customer?.id ?? null,
  customerName: d.customer ? [d.customer.firstName, d.customer.lastName].filter(Boolean).join(' ') : null,
  type: d.type,
  dueDate: iso(d.dueDate),
  dueAmount: money(d.dueAmount),
});

/**
 * Loans, payments and dues through ByajBazaar's loan and transaction services. A new loan is built by the same
 * function the loans API uses (buildNewLoan); a payment goes through the same request model and the transaction
 * service's loan-version check, so a payment previewed against an older state of the loan is refused.
 */
@Injectable()
export class ByajBazaarLoansAdapter implements IAiLoansGateway {
  constructor(
    @Inject(LOAN_SERVICE) private readonly loans: ILoanService,
    @Inject(TRANSACTION_SERVICE) private readonly transactions: ITransactionService,
    @Inject(ITEM_SERVICE) private readonly items: IItemService,
  ) {}

  async list(
    shopId: string,
    query: { customerId?: string; status?: string; limit: number },
  ): Promise<{ total: number; items: AiLoan[] }> {
    const statuses = query.status ? [query.status as ELoanStatus] : [ELoanStatus.OPEN, ELoanStatus.CLOSED];
    const pages = await Promise.all(
      statuses.map((status) =>
        this.loans.getLoans(
          plainToInstance(LoansFilterOptions, {
            createdBy: shopId,
            customerId: query.customerId,
            status,
            pageNumber: 1,
            pageSize: Math.min(Math.max(query.limit, 1), 50),
            sortOrder: ESortOrder.DESC,
            sortField: 'createdAt',
          }),
        ),
      ),
    );
    const items = pages
      .flatMap((p) => p.items)
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .slice(0, query.limit)
      .map(toLoan);
    return { total: pages.reduce((sum, p) => sum + (p.totalCount ?? p.items.length), 0), items };
  }

  async get(shopId: string, id: string): Promise<AiLoan | null> {
    const loan = await orNull(() => this.loans.getById(id, shopId));
    return loan ? toLoan(loan) : null;
  }

  async pledgeItemTypes(shopId: string): Promise<AiPledgeItemType[]> {
    return (await this.items.getAll(shopId)).filter((i) => i.id).map((i) => ({ id: i.id, name: i.name }));
  }

  async create(shopId: string, input: AiLoanCreateInput): Promise<AiLoan> {
    const dto = plainToInstance(CreateLoanRequestModel, input);
    await assertValid(dto);
    const loan = await businessCall(() => this.loans.create(buildNewLoan(dto, shopId)));
    return toLoan(loan);
  }

  async recentPayments(shopId: string, loanId: string, limit: number): Promise<AiLoanPayment[]> {
    const paged = await this.transactions.getTransactions(
      plainToInstance(TransactionsFilterOptions, {
        createdBy: shopId,
        loanId,
        pageNumber: 1,
        pageSize: Math.min(Math.max(limit, 1), 50),
        sortOrder: ESortOrder.DESC,
        sortField: 'createdAt',
      }),
    );
    return paged.items.map(toPayment);
  }

  async recordPayment(
    shopId: string,
    input: AiPaymentInput,
    expectedLoanVersion: number | null,
  ): Promise<AiLoanPayment> {
    const dto = plainToInstance(CreateTransactionRequestModel, {
      ...input,
      ...(expectedLoanVersion !== null ? { expectedLoanVersion } : {}),
    });
    await assertValid(dto);
    const data = plainToInstance(Transaction, dto, { excludeExtraneousValues: true });
    data.createdBy = shopId;
    const saved = await businessCall(() =>
      this.transactions.create(data, expectedLoanVersion === null ? undefined : expectedLoanVersion),
    );
    return toPayment(saved);
  }

  async dues(
    shopId: string,
    query: { customerName?: string; types?: string[]; limit: number },
  ): Promise<{ total: number; items: AiDue[] }> {
    const paged = await this.transactions.getDues(
      plainToInstance(DuesFilterOptions, {
        createdBy: shopId,
        customerName: query.customerName,
        type: query.types as EDueType[] | undefined,
        pageNumber: 1,
        pageSize: Math.min(Math.max(query.limit, 1), 50),
        sortOrder: ESortOrder.ASC,
        sortField: 'dueDate',
      }),
    );
    return { total: paged.totalCount ?? paged.items.length, items: paged.items.map(toDue) };
  }

  async stats(shopId: string): Promise<AiLoanStats> {
    const stats = await this.loans.getStats(
      shopId,
      plainToInstance(LoanStatsFilterOptions, { startDate: '2000-01-01', endDate: new Date().toISOString() }),
    );
    return {
      total: money(stats.total),
      open: money(stats.open),
      closed: money(stats.closed),
      amountRemaining: money(stats.amountRemaining),
      amountPaid: money(stats.amountPaid),
      interestRemaining: money(stats.interestRemaining),
      interestPaid: money(stats.interestPaid),
      customersCount: money(stats.customersCount),
      totalNetWeight: money(stats.totalNetWeight),
    };
  }
}

// ------------------------------------------------------------------ deposits

const toAccount = (a: DepositAccount): AiDepositAccount => ({
  id: a.id ?? '',
  depositNumber: a.depositNumber ?? null,
  customerId: a.customerId ?? null,
  customerName: [a.customerFirstName, a.customerLastName].filter(Boolean).join(' ') || null,
  name: a.name ?? null,
  status: a.status ?? null,
  currentBalance: money(a.currentBalance),
  totalDeposited: money(a.totalDeposited),
});

/** Deposits through ByajBazaar's deposit service, with the deposits API's request model. */
@Injectable()
export class ByajBazaarDepositsAdapter implements IAiDepositsGateway {
  constructor(@Inject(DEPOSIT_SERVICE) private readonly deposits: IDepositService) {}

  async list(
    shopId: string,
    query: { customerId?: string; status?: string; search?: string; limit: number },
  ): Promise<{ total: number; items: AiDepositAccount[] }> {
    const paged = await this.deposits.findAll(
      plainToInstance(DepositsFilterOptions, {
        createdBy: shopId,
        customerId: query.customerId,
        status: query.status,
        search: query.search,
        page: 1,
        limit: Math.min(Math.max(query.limit, 1), 50),
        sortOrder: ESortOrder.DESC,
        sortField: 'createdAt',
      }),
    );
    return { total: paged.totalCount ?? paged.items.length, items: paged.items.map(toAccount) };
  }

  async get(shopId: string, id: string): Promise<AiDepositAccount | null> {
    const account = await orNull(() => this.deposits.findOne(id, shopId));
    return account ? toAccount(account) : null;
  }

  async activeAccountFor(shopId: string, customerId: string): Promise<AiDepositAccount> {
    return toAccount(await businessCall(() => this.deposits.findOrCreateActiveAccount(customerId, shopId)));
  }

  async add(shopId: string, accountId: string, input: AiDepositAddInput): Promise<AiDepositAccount> {
    const dto = plainToInstance(AddDepositAmountRequestModel, input);
    await assertValid(dto);
    const data = plainToInstance(AddDepositData, dto, { excludeExtraneousValues: true });
    return toAccount(await businessCall(() => this.deposits.addDeposit(accountId, shopId, data)));
  }

  async ledger(shopId: string, accountId: string, limit: number): Promise<AiDepositEntry[]> {
    const entries = await this.deposits.getLedger(accountId, shopId);
    return entries
      .map((e) => ({
        id: e.id ?? '',
        type: e.type ?? null,
        amount: money(e.amount),
        paymentMode: e.paymentMode ?? null,
        createdAt: iso(e.createdAt),
      }))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, limit);
  }

  async stats(shopId: string): Promise<AiDepositStats> {
    const stats = await this.deposits.getStats(shopId);
    return {
      totalDeposits: money(stats.totalDeposits),
      activeAccounts: money(stats.activeAccounts),
      totalBalance: money(stats.totalBalance),
    };
  }
}
