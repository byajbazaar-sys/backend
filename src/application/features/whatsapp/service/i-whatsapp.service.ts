import {
  ConnectWhatsAppBusinessData,
  UpdateWhatsAppSettingsData,
  WhatsAppBusinessConnection,
  WhatsAppDisconnectResult,
  WhatsAppMessage,
  WhatsAppMessageResult,
  WhatsAppRegisterPhoneResult,
  WhatsAppTemplateCreateResult,
} from '../domain';
import { MetaTemplateSummary } from './i-meta-graph.client';

export const WHATSAPP_SERVICE = 'WHATSAPP_SERVICE';

export interface IWhatsAppService {
  sendTextMessage(userId: string, businessId: string, to: string, body: string): Promise<WhatsAppMessageResult>;
  sendTemplateMessage(
    userId: string,
    businessId: string,
    to: string,
    templateName: string,
    languageCode: string,
    parameters: string[],
  ): Promise<WhatsAppMessageResult>;
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
}
