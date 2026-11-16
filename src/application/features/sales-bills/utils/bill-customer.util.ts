import { Customer } from '../../customers/domain';

/** Bill fields that describe the buyer. */
export interface BillCustomerDetails {
  customerName?: string;
  customerMobile?: string;
  customerAddress?: string;
  customerState?: string;
  customerStateCode?: string;
  customerGstin?: string;
  customerPan?: string;
  customerPropName?: string;
}

/** Placeholder names that mean "no real customer". */
const ANONYMOUS_NAMES = new Set(['', 'walk-in', 'walk in', 'walkin', 'cash', 'customer', '-', '—']);

/** Last 10 digits of an Indian mobile number, or null when it isn't one. */
export function billMobileDigits(mobile?: string | null): string | null {
  const digits = (mobile ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const last10 = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(last10) ? last10 : null;
}

export function isRealCustomerName(name?: string | null): boolean {
  return !ANONYMOUS_NAMES.has((name ?? '').trim().toLowerCase());
}

/** "Ramesh Kumar Soni" → first "Ramesh", middle "Kumar", last "Soni". One word → last name empty. */
export function splitCustomerName(name: string): Pick<Customer, 'firstName' | 'middleName' | 'lastName'> {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' ').slice(0, 100),
    lastName: parts[parts.length - 1],
  };
}

const clean = (value?: string | null, max = 255): string | undefined => {
  const v = value?.trim();
  return v ? v.slice(0, max) : undefined;
};
const upper = (value?: string | null, max = 20): string | undefined => clean(value, max)?.toUpperCase();

/** Customer-profile values carried by a bill (bill key → customer key). */
export function customerDetailsFromBill(data: BillCustomerDetails): Partial<Customer> {
  return {
    location: clean(data.customerAddress, 500),
    state: clean(data.customerState, 100),
    stateCode: clean(data.customerStateCode, 10),
    gstin: upper(data.customerGstin),
    panNumber: upper(data.customerPan),
    propName: clean(data.customerPropName),
  };
}

/** A new customer record built from a bill. */
export function newCustomerFromBill(data: BillCustomerDetails, mobileDigits: string, userId: string): Customer {
  const name = splitCustomerName(data.customerName ?? '');
  return {
    ...customerDetailsFromBill(data),
    firstName: name.firstName.slice(0, 100),
    middleName: name.middleName,
    lastName: name.lastName.slice(0, 100),
    phone: mobileDigits,
    email: null,
    createdBy: userId,
  } as Customer;
}

/** Details the bill has but the existing customer is missing — never overwrites what's saved. */
export function missingCustomerDetails(existing: Customer, data: BillCustomerDetails): Partial<Customer> {
  const fromBill = customerDetailsFromBill(data);
  const patch: Partial<Customer> = {};
  for (const key of Object.keys(fromBill) as (keyof typeof fromBill)[]) {
    const value = fromBill[key];
    if (value && !existing[key]) (patch as Record<string, unknown>)[key] = value;
  }
  return patch;
}
