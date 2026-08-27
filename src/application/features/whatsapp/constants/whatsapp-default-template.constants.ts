export interface WhatsAppDefaultTemplateDefinition {
  name: string;
  language: string;
  category: string;
  bodyText: string;
}

/** Auto-provisioned on connect when no matching template exists on the WABA. */
export const WHATSAPP_DEFAULT_TEMPLATES: WhatsAppDefaultTemplateDefinition[] = [
  {
    name: 'byajbazaar_hello',
    language: 'en_US',
    category: 'UTILITY',
    bodyText:
      'Hello! Your WhatsApp Business account is now connected with ByajBazaar. Reply to this message anytime.',
  },
  {
    name: 'byajbazaar_due_reminder',
    language: 'en_US',
    category: 'UTILITY',
    bodyText:
      'Hi from {{1}}. Due reminder: your {{2}} due for this month amounting to {{3}} is pending. Please pay at your earliest convenience.',
  },
];

/** @deprecated Use WHATSAPP_DEFAULT_TEMPLATES */
export const WHATSAPP_DEFAULT_TEMPLATE = WHATSAPP_DEFAULT_TEMPLATES[0];
