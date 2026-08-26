export interface MetaSendMessageResult {
  messageId: string;
}

export interface MetaCreateTemplateResult {
  templateId: string;
  status: string;
}

export interface MetaTemplateSummary {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
}

export interface MetaGraphCredentials {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
}

export interface MetaPhoneNumberStatus {
  status: string;
  codeVerificationStatus?: string;
  displayPhoneNumber?: string;
}

export interface MetaRegisterPhoneResult {
  success: boolean;
  status: string;
}

export const META_GRAPH_CLIENT = 'IMetaGraphClient';

export interface IMetaGraphClient {
  sendTextMessage(credentials: MetaGraphCredentials, to: string, body: string): Promise<MetaSendMessageResult>;
  sendTemplateMessage(
    credentials: MetaGraphCredentials,
    to: string,
    templateName: string,
    languageCode: string,
    parameters: string[],
  ): Promise<MetaSendMessageResult>;
  createMessageTemplate(
    credentials: MetaGraphCredentials,
    name: string,
    language: string,
    category: string,
    bodyText: string,
  ): Promise<MetaCreateTemplateResult>;
  listMessageTemplates(credentials: MetaGraphCredentials): Promise<MetaTemplateSummary[]>;
  exchangeCodeForAccessToken(code: string, redirectUri?: string): Promise<string>;
  exchangeShortLivedUserToken(shortLivedToken: string): Promise<string>;
  getPhoneNumberStatus(accessToken: string, phoneNumberId: string): Promise<MetaPhoneNumberStatus>;
  registerPhoneNumber(accessToken: string, phoneNumberId: string, pin: string): Promise<MetaRegisterPhoneResult>;
}
