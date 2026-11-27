import { z } from 'zod';

import { AiCard, AiRecordRow } from '../../domain';
import { AiCustomer, AiDepositAccount, AiDue, AiLoan, AiLoanPayment, IAiCustomersGateway } from '../../ports';
import { AiToolOutcome } from '../ai-tool';

/** A payment / loan / deposit recorded after its preview with the same amount is treated as a duplicate. */
export const DUPLICATE_WINDOW_MS = 24 * 60 * 60_000;

export const rupees = (what: string) => z.number().positive().max(1_000_000_000).describe(`${what} in rupees (₹).`);
export const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('Date as YYYY-MM-DD (only if the person gave one).');

/** Who the record is for: an id from an earlier result, or the name / phone the person said. */
export const customerRef = {
  customerId: z.uuid().optional().describe('Customer id, when it came from an earlier result in this conversation.'),
  customer: z
    .string()
    .min(2)
    .max(80)
    .optional()
    .describe('Customer name or phone as the person said it, when there is no id.'),
};

export const inr = (n: number | null | undefined): string =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const compact = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;

export const customerName = (c: Pick<AiCustomer, 'firstName' | 'lastName'>): string =>
  [c.firstName, c.lastName].filter(Boolean).join(' ').trim();

/** The model sees only the last digits of a phone number. */
export const maskPhone = (phone: string | null | undefined): string | null => {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : null;
};

/** 10-digit Indian mobile (an optional +91 / 0 prefix is dropped). null when it is not one. */
export function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export const paths = {
  customer: (id: string) => `/customers/${id}`,
  loan: (customerId: string, loanId: string) => `/customers/${customerId}/loans/${loanId}`,
  deposit: (id: string) => `/deposits/${id}`,
};

export const customerRow = (c: AiCustomer): AiRecordRow => ({
  id: c.id,
  title: customerName(c),
  subtitle: [c.phone, c.location].filter(Boolean).join(' · ') || null,
  path: paths.customer(c.id),
});

export const loanRow = (l: AiLoan): AiRecordRow => ({
  id: l.id,
  title: l.customerName || 'Loan',
  subtitle: [
    l.items.map((i) => i.name).join(', ') || null,
    `${l.interestPercentage}% ${l.interestType === 'Daily' ? 'per day' : 'per month'}`,
    l.createdAt ? l.createdAt.slice(0, 10) : null,
  ]
    .filter(Boolean)
    .join(' · '),
  amount: l.amountRemaining,
  amountLabel: l.interestRemaining > 0 ? `+ ${inr(l.interestRemaining)} interest due` : 'principal due',
  status: l.status,
  path: paths.loan(l.customerId, l.id),
});

export const dueRow = (d: AiDue): AiRecordRow => ({
  id: d.id,
  title: d.customerName || 'Due',
  subtitle: d.dueDate ? `Due ${d.dueDate.slice(0, 10)}` : null,
  amount: d.dueAmount,
  status: d.type,
  path: d.customerId ? paths.loan(d.customerId, d.loanId) : '/dues',
});

export const depositRow = (a: AiDepositAccount): AiRecordRow => ({
  id: a.id,
  title: a.customerName || a.name || 'Deposit',
  subtitle: [a.depositNumber, a.name && a.customerName ? a.name : null].filter(Boolean).join(' · ') || null,
  amount: a.currentBalance,
  amountLabel: 'balance',
  status: a.status,
  path: paths.deposit(a.id),
});

export const paymentRow = (p: AiLoanPayment, title: string): AiRecordRow => ({
  id: p.id,
  title,
  subtitle: [p.transactionType, p.paidIn, p.createdAt?.slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · '),
  amount: p.amount,
});

export const recordsCard = (
  entity: Extract<AiCard, { type: 'records' }>['entity'],
  title: string,
  total: number,
  rows: AiRecordRow[],
  morePath?: string,
): AiCard => ({
  type: 'records',
  entity,
  title,
  total,
  rows,
  ...(morePath && total > rows.length ? { morePath } : {}),
});

/** Minimal customer data for the model (no full phone numbers, no documents). */
export const customerForModel = (c: AiCustomer) => ({
  id: c.id,
  name: customerName(c),
  phoneEnding: maskPhone(c.phone),
  location: c.location,
});

export type CustomerResolution = { kind: 'found'; customer: AiCustomer } | { kind: 'outcome'; outcome: AiToolOutcome };

/**
 * The customer a request is about: by id (from an earlier result) or by the name / phone the person said. Several
 * matches → the model asks which one (with a card to tap); none → it says so. Always within the actor's shop.
 */
export async function resolveCustomer(
  gateway: IAiCustomersGateway,
  shopId: string,
  ref: { customerId?: string; customer?: string },
): Promise<CustomerResolution | null> {
  if (ref.customerId) {
    const customer = await gateway.get(shopId, ref.customerId);
    return customer
      ? { kind: 'found', customer }
      : { kind: 'outcome', outcome: { kind: 'rejected', message: 'That customer was not found in this shop.' } };
  }
  const text = ref.customer?.trim();
  if (!text) return null;
  const phone = normalizePhone(text);
  const { items } = await gateway.search(shopId, phone ?? text, 6);
  if (!items.length) {
    return {
      kind: 'outcome',
      outcome: {
        kind: 'rejected',
        message: `No customer matches "${text}". Check the name, or add the customer first.`,
      },
    };
  }
  const wanted = text.toLowerCase().replace(/\s+/g, ' ');
  const exact = items.filter(
    (c) => (phone && normalizePhone(c.phone ?? '') === phone) || customerName(c).toLowerCase() === wanted,
  );
  if (items.length === 1 || exact.length === 1) return { kind: 'found', customer: exact[0] ?? items[0] };
  return {
    kind: 'outcome',
    outcome: {
      kind: 'ambiguous',
      message: `${items.length} customers match "${text}". Ask which one (name and phone ending).`,
      candidates: items.map(customerForModel),
      card: recordsCard('customer', `Customers matching "${text}"`, items.length, items.map(customerRow)),
    },
  };
}

/** Same amount (to the paisa) and recorded after `since`. */
export const sameAmount = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;

export const istTime = (iso: string | null | undefined): string =>
  iso
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso))
    : 'earlier';
