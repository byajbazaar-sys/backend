import { BillLogChange, SalesBill, SalesBillLineItem } from '../domain';

type Value = string | number | null;

/** Bill fields worth recording, with the label shown in the history. */
const BILL_FIELDS: { field: keyof SalesBill; label: string; money?: boolean; date?: boolean }[] = [
  { field: 'billNumber', label: 'Bill number' },
  { field: 'documentType', label: 'Bill type' },
  { field: 'customerName', label: 'Customer' },
  { field: 'customerMobile', label: 'Mobile' },
  { field: 'customerAddress', label: 'Address' },
  { field: 'customerState', label: 'State' },
  { field: 'customerStateCode', label: 'State code' },
  { field: 'customerGstin', label: 'Customer GSTIN' },
  { field: 'customerPan', label: 'Customer PAN' },
  { field: 'customerPropName', label: 'Proprietor' },
  { field: 'paymentMode', label: 'Payment mode' },
  { field: 'status', label: 'Status' },
  { field: 'issuedAt', label: 'Bill date', date: true },
  { field: 'subtotal', label: 'Subtotal', money: true },
  { field: 'discount', label: 'Discount', money: true },
  { field: 'cgstAmount', label: 'CGST', money: true },
  { field: 'sgstAmount', label: 'SGST', money: true },
  { field: 'roundOff', label: 'Round off', money: true },
  { field: 'grandTotal', label: 'Total', money: true },
  { field: 'amountReceived', label: 'Amount received', money: true },
  { field: 'depositApplied', label: 'Deposit applied', money: true },
];

const LINE_FIELDS: { field: keyof SalesBillLineItem; label: string; money?: boolean; weight?: boolean }[] = [
  { field: 'itemName', label: 'name' },
  { field: 'quantity', label: 'quantity' },
  { field: 'grossWeight', label: 'gross weight', weight: true },
  { field: 'netWeight', label: 'net weight', weight: true },
  { field: 'lessWeight', label: 'less weight', weight: true },
  { field: 'purity', label: 'purity' },
  { field: 'huid', label: 'HUID' },
  { field: 'hsnCode', label: 'HSN' },
  { field: 'makingCharges', label: 'making charges', money: true },
  { field: 'sellingPrice', label: 'price', money: true },
  { field: 'lineTotal', label: 'amount', money: true },
];

function asText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value as string | number | boolean);
}

function normalise(value: unknown, opts: { money?: boolean; weight?: boolean; date?: boolean } = {}): Value {
  if (value === undefined || value === null || value === '') return null;
  if (opts.date) {
    const d = value instanceof Date ? value : new Date(asText(value));
    return Number.isNaN(d.getTime()) ? asText(value) : d.toISOString();
  }
  if (opts.money || opts.weight) {
    const n = Number(value);
    if (!Number.isFinite(n)) return asText(value);
    return opts.weight ? Math.round(n * 1000) / 1000 : Math.round(n * 100) / 100;
  }
  if (typeof value === 'number') return value;
  return asText(value).trim();
}

function differs(a: Value, b: Value): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 0.0001;
  return a !== b;
}

function lineKey(line: SalesBillLineItem, index: number): string {
  return line.id ?? line.inventoryItemId ?? `${line.sku}#${index}`;
}

/** Field-by-field changes between the bill before and after an edit (bill fields and item lines). */
export function diffBills(before: SalesBill, after: SalesBill): BillLogChange[] {
  const changes: BillLogChange[] = [];
  for (const spec of BILL_FIELDS) {
    const from = normalise(before[spec.field], spec);
    const to = normalise(after[spec.field], spec);
    if (differs(from, to)) changes.push({ field: String(spec.field), label: spec.label, from, to });
  }

  const beforeLines = new Map((before.items ?? []).map((l, i) => [lineKey(l, i), l]));
  const afterLines = new Map((after.items ?? []).map((l, i) => [lineKey(l, i), l]));
  for (const [key, line] of afterLines) {
    const prev = beforeLines.get(key);
    const name = line.itemName || line.sku;
    if (!prev) {
      changes.push({
        field: `items[${key}]`,
        label: `Item added: ${name}`,
        from: null,
        to: normalise(line.lineTotal, { money: true }),
      });
      continue;
    }
    for (const spec of LINE_FIELDS) {
      const from = normalise(prev[spec.field], spec);
      const to = normalise(line[spec.field], spec);
      if (differs(from, to)) {
        changes.push({ field: `items[${key}].${String(spec.field)}`, label: `${name} — ${spec.label}`, from, to });
      }
    }
  }
  for (const [key, line] of beforeLines) {
    if (!afterLines.has(key)) {
      changes.push({
        field: `items[${key}]`,
        label: `Item removed: ${line.itemName || line.sku}`,
        from: normalise(line.lineTotal, { money: true }),
        to: null,
      });
    }
  }
  return changes;
}

/** A plain copy of the bill for the history (kept when the bill is deleted). */
export function billSnapshot(bill: SalesBill): Record<string, unknown> {
  return JSON.parse(JSON.stringify(bill)) as Record<string, unknown>;
}
