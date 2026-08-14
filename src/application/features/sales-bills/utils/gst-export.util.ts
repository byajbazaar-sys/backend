import * as Papa from 'papaparse';

import { SalesBill } from '../domain';
import { EDocumentType } from '../enums';

export const GST_EXPORT_COLUMNS = [
  'Invoice Number',
  'Invoice Date',
  'Customer Name',
  'Customer GSTIN',
  'Customer State',
  'Bill Type',
  'Payment Mode',
  'HSN Code',
  'Item Name',
  'Quantity',
  'Gross Weight',
  'Net Weight',
  'Making Charges',
  'Stone Charges',
  'Taxable Amount',
  'GST %',
  'CGST Amount',
  'SGST Amount',
  'Total GST',
  'Grand Total',
  'Invoice Status',
] as const;

function formatInvoiceDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatBillType(documentType: EDocumentType): string {
  if (documentType === EDocumentType.NormalBill) return 'Tax invoice';
  if (documentType === EDocumentType.InformalBill) return 'Informal bill';
  return String(documentType);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildGstExportRows(bills: SalesBill[]): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [];

  for (const bill of bills) {
    const items = bill.items ?? [];
    if (items.length === 0) continue;

    const subtotal = Number(bill.subtotal) || 0;
    const billTaxable = Math.max(0, subtotal - Number(bill.discount ?? 0));
    const cgstTotal = Number(bill.cgstAmount ?? 0);
    const sgstTotal = Number(bill.sgstAmount ?? 0);
    const gstRate = round2(Number(bill.cgstRate ?? 0) + Number(bill.sgstRate ?? 0));
    const grandTotal = Number(bill.grandTotal) || 0;
    const invoiceDate = formatInvoiceDate(bill.issuedAt);

    for (const item of items) {
      const lineTotal = Number(item.lineTotal) || 0;
      const ratio = subtotal > 0 ? lineTotal / subtotal : 1 / items.length;
      const taxableAmount = round2(billTaxable * ratio);
      const cgstAmount = round2(cgstTotal * ratio);
      const sgstAmount = round2(sgstTotal * ratio);
      const totalGst = round2(cgstAmount + sgstAmount);

      rows.push({
        'Invoice Number': bill.billNumber,
        'Invoice Date': invoiceDate,
        'Customer Name': bill.customerName,
        'Customer GSTIN': bill.customerGstin ?? '',
        'Customer State': bill.customerState ?? '',
        'Bill Type': formatBillType(bill.documentType),
        'Payment Mode': bill.paymentMode,
        'HSN Code': item.hsnCode ?? '',
        'Item Name': item.itemName,
        Quantity: Number(item.quantity) || 0,
        'Gross Weight': item.grossWeight != null ? Number(item.grossWeight) : '',
        'Net Weight': item.netWeight != null ? Number(item.netWeight) : '',
        'Making Charges': Number(item.makingCharges) || 0,
        'Stone Charges': 0,
        'Taxable Amount': taxableAmount,
        'GST %': gstRate,
        'CGST Amount': cgstAmount,
        'SGST Amount': sgstAmount,
        'Total GST': totalGst,
        'Grand Total': grandTotal,
        'Invoice Status': bill.status,
      });
    }
  }

  return rows;
}

export function toGstExportCsv(bills: SalesBill[]): string {
  const rows = buildGstExportRows(bills);
  return Papa.unparse(rows, { columns: [...GST_EXPORT_COLUMNS] });
}
