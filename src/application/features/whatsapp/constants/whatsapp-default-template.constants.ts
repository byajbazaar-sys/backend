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
    name: 'byajbazaar_bill_pdf',
    language: 'en_US',
    category: 'UTILITY',
    headerFormat: 'DOCUMENT',
    bodyText:
      'Your bill from {{1}} is attached as a PDF. Please review it and contact us if you have any questions.',
  },
];

export const WHATSAPP_BILL_PDF_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_bill_pdf') ??
  WHATSAPP_DEFAULT_TEMPLATES[0];

/** Approved template used to re-open conversations outside the 24-hour window (no variables). */
export const WHATSAPP_REENGAGEMENT_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_hello') ?? WHATSAPP_DEFAULT_TEMPLATES[0];

/** @deprecated Use WHATSAPP_DEFAULT_TEMPLATES */
export const WHATSAPP_DEFAULT_TEMPLATE = WHATSAPP_DEFAULT_TEMPLATES[0];
