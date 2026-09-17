export interface WhatsAppDefaultTemplateDefinition {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  /** When set, creates a template with a document header (for bill PDF delivery). */
  headerFormat?: 'DOCUMENT';
}

/** Auto-provisioned on connect when no matching template exists on the WABA. */
export const WHATSAPP_DEFAULT_TEMPLATES: WhatsAppDefaultTemplateDefinition[] = [
  {
    name: 'byajbazaar_hello',
    language: 'en_US',
    category: 'UTILITY',
    bodyText: 'Hello! Your WhatsApp Business account is now connected with ByajBazaar. Reply to this message anytime.',
  },
  {
    name: 'byajbazaar_due_reminder',
    language: 'en_US',
    category: 'UTILITY',
    bodyText:
      'Hi from {{1}}. Due reminder: your {{2}} due for this month amounting to {{3}} is pending. Please pay at your earliest convenience.',
  },
  {
    name: 'byajbazaar_order_created',
    language: 'en_US',
    category: 'UTILITY',
    bodyText:
      'Thank you for your order at {{1}}! Order {{2}} ({{3}}) has been placed. Expected delivery: {{4}}. Reply if you have any questions.',
  },
  {
    name: 'byajbazaar_order_update',
    language: 'en_US',
    category: 'UTILITY',
    bodyText:
      'Update from {{1}}: Order {{2}} ({{3}}) is now {{4}}. Expected delivery: {{5}}. Reply if you have any questions.',
  },
  {
    name: 'byajbazaar_bill_pdf',
    language: 'en_US',
    category: 'UTILITY',
    headerFormat: 'DOCUMENT',
    bodyText:
      'Your bill from {{1}} is attached as a PDF. Please review it and contact us if you have any questions.',
  },
  {
    name: 'byajbazaar_deposit_receipt_pdf',
    language: 'en_US',
    category: 'UTILITY',
    headerFormat: 'DOCUMENT',
    bodyText:
      'Your deposit receipt from {{1}} is attached as a PDF. Thank you for your payment.',
  },
  {
    name: 'byajbazaar_payment_receipt_pdf',
    language: 'en_US',
    category: 'UTILITY',
    headerFormat: 'DOCUMENT',
    bodyText:
      'Your payment receipt from {{1}} is attached as a PDF. Thank you for your payment.',
  },
  {
    name: 'byajbazaar_payment_received',
    language: 'en_US',
    category: 'UTILITY',
    bodyText:
      'Payment of {{1}} received at {{2}} for loan {{3}} on {{4}} via {{5}}. Thank you for your payment.',
  },
  {
    name: 'byajbazaar_deposit_received',
    language: 'en_US',
    category: 'UTILITY',
    bodyText:
      'Deposit of {{1}} received at {{2}} on account {{3}}. Updated balance: {{4}}. Thank you.',
  },
];

export const WHATSAPP_BILL_PDF_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_bill_pdf') ??
  WHATSAPP_DEFAULT_TEMPLATES[0];

export const WHATSAPP_DEPOSIT_RECEIPT_PDF_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_deposit_receipt_pdf') ??
  WHATSAPP_BILL_PDF_TEMPLATE;

export const WHATSAPP_PAYMENT_RECEIPT_PDF_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_payment_receipt_pdf') ??
  WHATSAPP_DEPOSIT_RECEIPT_PDF_TEMPLATE;

export const WHATSAPP_PAYMENT_RECEIVED_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_payment_received') ??
  WHATSAPP_DEFAULT_TEMPLATES[1];

export const WHATSAPP_DEPOSIT_RECEIVED_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_deposit_received') ??
  WHATSAPP_DEFAULT_TEMPLATES[1];

/** Approved template used to re-open conversations outside the 24-hour window (no variables). */
export const WHATSAPP_REENGAGEMENT_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_hello') ?? WHATSAPP_DEFAULT_TEMPLATES[0];

/** @deprecated Use WHATSAPP_DEFAULT_TEMPLATES */
export const WHATSAPP_DEFAULT_TEMPLATE = WHATSAPP_DEFAULT_TEMPLATES[0];
