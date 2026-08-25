import {
  ConnectWhatsAppBusinessData,
  WhatsAppBusinessConnection,
  WhatsAppDisconnectResult,
  WhatsAppMessageResult,
  WhatsAppTemplateCreateResult,
} from '../domain';
import { MetaTemplateSummary } from './i-meta-graph.client';

export const WHATSAPP_SERVICE = 'WHATSAPP_SERVICE';

export interface IWhatsAppService {
  sendTextMessage(
    userId: string,
    businessId: string,
    to: string,
    body: string,
  ): Promise<WhatsAppMessageResult>;
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
  getWhatsAppConnection(userId: string, businessId: string): Promise<WhatsAppBusinessConnection>;
  disconnectWhatsAppBusiness(userId: string, businessId: string): Promise<WhatsAppDisconnectResult>;
}
