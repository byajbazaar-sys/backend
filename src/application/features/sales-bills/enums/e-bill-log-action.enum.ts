/** Every operation recorded in a bill's history (bill_logs). */
export enum EBillLogAction {
  Created = 'CREATED',
  Updated = 'UPDATED',
  ConvertedToNormal = 'CONVERTED_TO_NORMAL',
  Deleted = 'DELETED',
  // Reported by the apps (printing and sharing happen on the device).
  Printed = 'PRINTED',
  ReceiptPrinted = 'RECEIPT_PRINTED',
  PdfDownloaded = 'PDF_DOWNLOADED',
  PdfShared = 'PDF_SHARED',
  WhatsAppShared = 'WHATSAPP_SHARED',
}

/** Actions the apps may report via POST /bills/:id/logs. */
export const CLIENT_BILL_LOG_ACTIONS = [
  EBillLogAction.Printed,
  EBillLogAction.ReceiptPrinted,
  EBillLogAction.PdfDownloaded,
  EBillLogAction.PdfShared,
  EBillLogAction.WhatsAppShared,
] as const;
