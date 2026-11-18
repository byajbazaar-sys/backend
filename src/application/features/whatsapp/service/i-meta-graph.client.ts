import { MetaCreateTemplateResult } from './meta-create-template-result';
import { MetaGraphCredentials } from './meta-graph-credentials';
import { MetaPhoneNumberStatus } from './meta-phone-number-status';
import { MetaRegisterPhoneResult } from './meta-register-phone-result';
import { MetaSendMessageResult } from './meta-send-message-result';
import { MetaSubscribeAppResult } from './meta-subscribe-app-result';
import { MetaTemplateSummary } from './meta-template-summary';
import { MetaWabaPhoneNumber } from './meta-waba-phone-number';
import { MetaWhatsAppBusinessAccountInfo } from './meta-whatsapp-business-account-info';

export const META_GRAPH_CLIENT = 'IMetaGraphClient';

export interface IMetaGraphClient {
  sendTextMessage(credentials: MetaGraphCredentials, to: string, body: string): Promise<MetaSendMessageResult>;
  sendDocumentMessage(
    credentials: MetaGraphCredentials,
    to: string,
    mediaId: string,
    filename: string,
  ): Promise<MetaSendMessageResult>;
  sendTemplateMessage(
    credentials: MetaGraphCredentials,
    to: string,
    templateName: string,
    languageCode: string,
    parameters: string[],
  ): Promise<MetaSendMessageResult>;
  sendTemplateDocumentMessage(
    credentials: MetaGraphCredentials,
    to: string,
    templateName: string,
    languageCode: string,
    mediaId: string,
    filename: string,
    bodyParameters: string[],
  ): Promise<MetaSendMessageResult>;
  uploadMedia(
    credentials: MetaGraphCredentials,
    fileBuffer: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string>;
  createMessageTemplate(
    credentials: MetaGraphCredentials,
    name: string,
    language: string,
    category: string,
    bodyText: string,
    headerFormat?: 'DOCUMENT',
  ): Promise<MetaCreateTemplateResult>;
  listMessageTemplates(credentials: MetaGraphCredentials): Promise<MetaTemplateSummary[]>;
  exchangeCodeForAccessToken(code: string, redirectUri?: string): Promise<string>;
  exchangeShortLivedUserToken(shortLivedToken: string): Promise<string>;
  /** WABA IDs granted to this token — used when Embedded Signup cannot post waba_id back. */
  listWabaIdsForToken(accessToken: string): Promise<string[]>;
  listWabaPhoneNumbers(accessToken: string, wabaId: string): Promise<MetaWabaPhoneNumber[]>;
  getWabaName(accessToken: string, wabaId: string): Promise<string | undefined>;
  getPhoneNumberStatus(accessToken: string, phoneNumberId: string): Promise<MetaPhoneNumberStatus>;
  getWhatsAppBusinessAccount(accessToken: string, wabaId: string): Promise<MetaWhatsAppBusinessAccountInfo>;
  registerPhoneNumber(accessToken: string, phoneNumberId: string, pin: string): Promise<MetaRegisterPhoneResult>;
  subscribeAppToWaba(accessToken: string, wabaId: string): Promise<MetaSubscribeAppResult>;
}
