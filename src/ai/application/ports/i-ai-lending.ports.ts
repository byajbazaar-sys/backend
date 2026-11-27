/**
 * What the assistant needs from ByajBazaar's customers, loans (girvi), payments, dues and deposits. Implemented by
 * infrastructure/adapters with the existing services and the APIs' own request models — the assistant never touches
 * tables. Every method is scoped to `shopId`, which always comes from the authenticated request.
 */

export const AI_CUSTOMERS_GATEWAY = 'AI_CUSTOMERS_GATEWAY';
export const AI_LOANS_GATEWAY = 'AI_LOANS_GATEWAY';
export const AI_DEPOSITS_GATEWAY = 'AI_DEPOSITS_GATEWAY';

export interface AiCustomer {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  location: string | null;
}

export interface AiCustomerCreateInput {
  firstName: string;
  lastName: string;
  phone?: string;
  alternativePhone?: string;
  email?: string;
  location?: string;
}

export interface IAiCustomersGateway {
  /** Name or phone search (newest first). */
  search(shopId: string, text: string | undefined, limit: number): Promise<{ total: number; items: AiCustomer[] }>;
  /** null when not found in this shop. */
  get(shopId: string, id: string): Promise<AiCustomer | null>;
  /** Throws AiBusinessError when a customer rule says no. */
  create(shopId: string, input: AiCustomerCreateInput): Promise<AiCustomer>;
}

export interface AiLoan {
  id: string;
  customerId: string;
  customerName: string | null;
  status: string;
  /** Principal still to be paid. */
  amountRemaining: number;
  amountPaid: number;
  interestRemaining: number;
  interestPaid: number;
  interestPercentage: number;
  interestType: string;
  tenureValue: number;
  tenureType: string;
  /** Optimistic-lock version: a payment is saved only against the loan as previewed. */
  version: number | null;
  createdAt: string | null;
  items: { name: string; netWeight: number | null; grossWeight: number | null; amount: number | null }[];
}

/** A pledge item type from the shop's item list (Payal, Chain …), which loan lines refer to. */
export interface AiPledgeItemType {
  id: string;
  name: string;
}

export interface AiLoanCreateInput {
  customerId: string;
  tenureType: string;
  tenureValue: number;
  interestPercentage: number;
  interestType: string;
  interestCalculationMethod: string;
  startDate?: string;
  loanItems: {
    itemId: string;
    itemName: string;
    amount: number;
    netWeightInGrams: number;
    grossWeightInGrams: number;
  }[];
}

export interface AiLoanPayment {
  id: string;
  loanId: string;
  amount: number;
  transactionType: string;
  paidIn: string;
  createdAt: string | null;
}

export interface AiPaymentInput {
  loanId: string;
  amount: number;
  transactionType: string;
  paidIn: string;
  paidAt?: string;
}

export interface AiDue {
  id: string;
  loanId: string;
  customerId: string | null;
  customerName: string | null;
  type: string;
  dueDate: string | null;
  dueAmount: number;
}

export interface AiLoanStats {
  total: number;
  open: number;
  closed: number;
  amountRemaining: number;
  amountPaid: number;
  interestRemaining: number;
  interestPaid: number;
  customersCount: number;
  totalNetWeight: number;
}

export interface IAiLoansGateway {
  list(
    shopId: string,
    query: { customerId?: string; status?: string; limit: number },
  ): Promise<{ total: number; items: AiLoan[] }>;
  get(shopId: string, id: string): Promise<AiLoan | null>;
  pledgeItemTypes(shopId: string): Promise<AiPledgeItemType[]>;
  create(shopId: string, input: AiLoanCreateInput): Promise<AiLoan>;
  /** Payments on one loan, newest first. */
  recentPayments(shopId: string, loanId: string, limit: number): Promise<AiLoanPayment[]>;
  /** `expectedLoanVersion`: rejected (CONFLICT) when the loan changed since the preview. */
  recordPayment(shopId: string, input: AiPaymentInput, expectedLoanVersion: number | null): Promise<AiLoanPayment>;
  dues(
    shopId: string,
    query: { customerName?: string; types?: string[]; limit: number },
  ): Promise<{ total: number; items: AiDue[] }>;
  stats(shopId: string): Promise<AiLoanStats>;
}

export interface AiDepositAccount {
  id: string;
  depositNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  name: string | null;
  status: string | null;
  currentBalance: number;
  totalDeposited: number;
}

export interface AiDepositEntry {
  id: string;
  type: string | null;
  amount: number;
  paymentMode: string | null;
  createdAt: string | null;
}

export interface AiDepositAddInput {
  amount: number;
  paymentMode: string;
  transactionReference?: string;
  remarks?: string;
}

export interface AiDepositStats {
  totalDeposits: number;
  activeAccounts: number;
  totalBalance: number;
}

export interface IAiDepositsGateway {
  list(
    shopId: string,
    query: { customerId?: string; status?: string; search?: string; limit: number },
  ): Promise<{ total: number; items: AiDepositAccount[] }>;
  get(shopId: string, id: string): Promise<AiDepositAccount | null>;
  /** The customer's active account, opened when there is none (the deposits API's own rule). */
  activeAccountFor(shopId: string, customerId: string): Promise<AiDepositAccount>;
  add(shopId: string, accountId: string, input: AiDepositAddInput): Promise<AiDepositAccount>;
  /** Ledger entries, newest first. */
  ledger(shopId: string, accountId: string, limit: number): Promise<AiDepositEntry[]>;
  stats(shopId: string): Promise<AiDepositStats>;
}

/**
 * Live progress of a turn ("Looking up loans…") to the person's open app connections. Best effort: never throws,
 * and the answer itself always comes back on the HTTP response.
 */
export const AI_PROGRESS_NOTIFIER = 'AI_PROGRESS_NOTIFIER';
export interface AiProgressEvent {
  clientMessageId: string | null;
  conversationId: string;
  step: 'thinking' | 'tool' | 'writing';
  label: string;
}
export interface IAiProgressNotifier {
  notify(target: { shopId: string; actorUserId: string }, event: AiProgressEvent): Promise<void>;
}
