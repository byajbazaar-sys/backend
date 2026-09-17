import { Paged } from '@shared-libs';

import {
  ConnectWhatsAppBusinessData,
  SendWhatsAppTextMessageOptions,
  UpdateWhatsAppSettingsData,
  WhatsAppBusinessConnection,
  WhatsAppDisconnectResult,
  WhatsAppMessage,
  WhatsAppMessageResult,
  WhatsAppOutboundContext,
  WhatsAppRegisterPhoneResult,
  WhatsAppTemplateCreateResult,
} from '../domain';
import { WhatsAppMessagesFilterOptions } from '../options/whatsapp-messages-filter.options';
import { MetaTemplateSummary } from './i-meta-graph.client';

export const WHATSAPP_SERVICE = 'WHATSAPP_SERVICE';

export interface IWhatsAppService {
  sendTextMessage(
    userId: string,
    businessId: string,
    to: string,
    body: string,
    options?: SendWhatsAppTextMessageOptions,
  ): Promise<WhatsAppMessageResult>;
  sendTemplateMessage(
    userId: string,
    businessId: string,
    to: string,
    templateName: string,
    languageCode: string,
    parameters: string[],
    outboundContext?: WhatsAppOutboundContext,
  ): Promise<WhatsAppMessageResult>;
  sendBillPdfDocument(
    userId: string,
    businessId: string,
    to: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    shopName: string,
    outboundContext?: WhatsAppOutboundContext,
  ): Promise<WhatsAppMessageResult>;
  sendDepositPdfDocument(
    userId: string,
    businessId: string,
    to: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    shopName: string,
    outboundContext?: WhatsAppOutboundContext,
  ): Promise<WhatsAppMessageResult>;
  sendDepositNotificationMessage(
    userId: string,
    businessId: string,
    to: string,
    shopName: string,
    details: {
      amount: string;
      depositNumber: string;
      transactionType?: string;
      balanceAfter?: string;
      receiptNumber?: string;
      transactionDate?: string;
      customerName?: string;
      depositAccountId?: string;
    },
  ): Promise<WhatsAppMessageResult>;
  sendTransactionPdfDocument(
    userId: string,
    businessId: string,
    to: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    shopName: string,
    outboundContext?: WhatsAppOutboundContext,
  ): Promise<WhatsAppMessageResult>;
  sendTransactionNotificationMessage(
    userId: string,
    businessId: string,
    to: string,
    shopName: string,
    details: {
      amount: string;
      loanNumber?: string;
      transactionType?: string;
      paidIn?: string;
      paymentDate?: string;
      customerName?: string;
      transactionId?: string;
    },
  ): Promise<WhatsAppMessageResult>;
  listMessageHistory(
    userId: string,
    businessId: string,
    options: Omit<WhatsAppMessagesFilterOptions, 'userId'>,
  ): Promise<Paged<WhatsAppMessage>>;
  createTemplate(
    userId: string,
    businessId: string,
    name: string,
    language: string,
    category: string,
    bodyText: string,
  ): Promise<WhatsAppTemplateCreateResult>;
  listTemplates(userId: string, businessId: string): Promise<MetaTemplateSummary[]>;
  connectWhatsAppBusiness(
    userId: string,
    businessId: string,
    data: ConnectWhatsAppBusinessData,
  ): Promise<WhatsAppBusinessConnection>;
  getMessageDeliveryStatus(userId: string, businessId: string, metaMessageId: string): Promise<WhatsAppMessage>;
  registerWhatsAppPhone(
    userId: string,
    businessId: string,
    registrationPin: string,
  ): Promise<WhatsAppRegisterPhoneResult>;
  getWhatsAppConnection(userId: string, businessId: string): Promise<WhatsAppBusinessConnection>;
  updateWhatsAppSettings(
    userId: string,
    businessId: string,
    data: UpdateWhatsAppSettingsData,
  ): Promise<WhatsAppBusinessConnection>;
  disconnectWhatsAppBusiness(userId: string, businessId: string): Promise<WhatsAppDisconnectResult>;
  provisionWhatsAppDefaultTemplates(userId: string, businessId: string): Promise<void>;
  createWhatsAppOnboardingSession(
    userId: string,
    businessId: string,
    registrationPin: string,
    fromMobileApp: boolean,
    redirectUri?: string,
  ): Promise<{ sessionId: string; expiresInSeconds: number }>;
  getWhatsAppOnboardingSession(
    userId: string,
    sessionId: string,
  ): Promise<{ exists: boolean; fromMobileApp: boolean }>;
  createWhatsAppMobileReturnSession(
    userId: string,
    businessId: string,
  ): Promise<{ sessionId: string; expiresInSeconds: number }>;
  resolveWhatsAppMobileReturnSession(
    userId: string,
    businessId: string,
    sessionId: string,
  ): Promise<{
    status: 'connected' | 'processing' | 'expired' | 'invalid';
    connection?: WhatsAppBusinessConnection | null;
  }>;
}
