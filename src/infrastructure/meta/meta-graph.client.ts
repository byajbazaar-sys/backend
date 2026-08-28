import { BadRequestException, Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { assertMetaGraphSuccess, mapMetaGraphError } from './meta-graph.errors';
import {
  IMetaGraphClient,
  MetaCreateTemplateResult,
  MetaGraphCredentials,
  MetaPhoneNumberStatus,
  MetaRegisterPhoneResult,
  MetaSendMessageResult,
  MetaSubscribeAppResult,
  MetaTemplateSummary,
  MetaWhatsAppOptions,
} from '../../application';

interface MetaMessagesResponse {
  messages?: { id?: string }[];
  error?: { message?: string; code?: number };
}

interface MetaTemplateCreateResponse {
  id?: string;
  status?: string;
  error?: { message?: string; code?: number };
}

interface MetaTemplateListResponse {
  data?: {
    id?: string;
    name?: string;
    language?: string;
    status?: string;
    category?: string;
  }[];
  error?: { message?: string; code?: number };
}

@Injectable()
export class MetaGraphClient implements IMetaGraphClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly options: MetaWhatsAppOptions,
    @InjectPinoLogger(MetaGraphClient.name) private readonly logger: PinoLogger,
  ) {
    this.http = axios.create({
      baseURL: this.options.graphApiBaseUrl,
      timeout: 30_000,
      validateStatus: () => true,
    });
  }

  async sendTextMessage(credentials: MetaGraphCredentials, to: string, body: string): Promise<MetaSendMessageResult> {
    return this.postMessage(credentials, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    });
  }

  async sendTemplateMessage(
    credentials: MetaGraphCredentials,
    to: string,
    templateName: string,
    languageCode: string,
    parameters: string[],
  ): Promise<MetaSendMessageResult> {
    const template: Record<string, unknown> = {
      name: templateName,
      language: { code: languageCode },
    };

    if (parameters.length > 0) {
      template.components = [
        {
          type: 'body',
          parameters: parameters.map((text) => ({ type: 'text', text })),
        },
      ];
    }

    return this.postMessage(credentials, {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template,
    });
  }

  async createMessageTemplate(
    credentials: MetaGraphCredentials,
    name: string,
    language: string,
    category: string,
    bodyText: string,
  ): Promise<MetaCreateTemplateResult> {
    const placeholderCount = (bodyText.match(/\{\{\d+\}\}/g) ?? []).length;
    const exampleValues = Array.from({ length: placeholderCount }, (_, index) => `Example ${index + 1}`);

    const payload = {
      name,
      language,
      category,
      components: [
        {
          type: 'BODY',
          text: bodyText,
          ...(exampleValues.length ? { example: { body_text: [exampleValues] } } : {}),
        },
      ],
    };

    try {
      const response = await this.http.post<MetaTemplateCreateResponse>(
        `/${credentials.wabaId}/message_templates`,
        payload,
        { headers: this.authHeaders(credentials.accessToken) },
      );

      const body = assertMetaGraphSuccess(response.status, response.data, 'Failed to create WhatsApp template');
      this.logger.info(
        {
          operation: 'createMessageTemplate',
          metaEndpoint: `/${credentials.wabaId}/message_templates`,
          httpStatus: response.status,
          templateId: body.id,
          templateStatus: body.status,
        },
        'WhatsApp template created',
      );

      return {
        templateId: String(body.id ?? ''),
        status: String(body.status ?? 'PENDING'),
      };
    } catch (err) {
      mapMetaGraphError(err, 'Failed to create WhatsApp template');
    }
  }

  async listMessageTemplates(credentials: MetaGraphCredentials): Promise<MetaTemplateSummary[]> {
    try {
      const response = await this.http.get<MetaTemplateListResponse>(`/${credentials.wabaId}/message_templates`, {
        headers: this.authHeaders(credentials.accessToken),
        params: {
          fields: 'id,name,language,status,category',
          limit: 100,
        },
      });

      const body = assertMetaGraphSuccess(response.status, response.data, 'Failed to list WhatsApp templates');
      this.logger.info(
        {
          operation: 'listMessageTemplates',
          metaEndpoint: `/${credentials.wabaId}/message_templates`,
          httpStatus: response.status,
          templateCount: body.data?.length ?? 0,
        },
        'WhatsApp templates listed',
      );

      return (body.data ?? []).map((row) => ({
        id: String(row.id ?? ''),
        name: String(row.name ?? ''),
        language: String(row.language ?? ''),
        status: String(row.status ?? ''),
        category: row.category,
      }));
    } catch (err) {
      mapMetaGraphError(err, 'Failed to list WhatsApp templates');
    }
  }

  async exchangeShortLivedUserToken(shortLivedToken: string): Promise<string> {
    try {
      const response = await this.http.get<{
        access_token?: string;
        error?: { message?: string; code?: number };
      }>('/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.options.appId,
          client_secret: this.options.appSecret,
          fb_exchange_token: shortLivedToken.trim(),
        },
      });

      const body = assertMetaGraphSuccess(response.status, response.data, 'Failed to exchange Meta user token');
      const accessToken = body.access_token?.trim();
      if (!accessToken) {
        throw new BadRequestException('Meta did not return an access token');
      }

      this.logger.info(
        { operation: 'exchangeShortLivedUserToken', metaEndpoint: '/oauth/access_token', httpStatus: response.status },
        'Meta short-lived user token exchanged for long-lived token',
      );

      return accessToken;
    } catch (err) {
      mapMetaGraphError(err, 'Failed to exchange Meta user token');
    }
  }

  async exchangeCodeForAccessToken(code: string, redirectUri?: string): Promise<string> {
    const normalizedRedirect = redirectUri?.trim();
    const redirectCandidates: (string | undefined)[] = [undefined];
    if (normalizedRedirect) {
      redirectCandidates.push(normalizedRedirect);
      if (!normalizedRedirect.endsWith('/')) {
        redirectCandidates.push(`${normalizedRedirect}/`);
      }
    }

    let lastError: unknown;
    for (const candidate of redirectCandidates) {
      try {
        const params: Record<string, string> = {
          client_id: this.options.appId,
          client_secret: this.options.appSecret,
          code: code.trim(),
        };
        if (candidate) {
          params.redirect_uri = candidate;
        }

        const response = await this.http.get<{
          access_token?: string;
          error?: { message?: string; code?: number; error_subcode?: number };
        }>('/oauth/access_token', { params });

        const body = assertMetaGraphSuccess(response.status, response.data, 'Failed to exchange Meta OAuth code');
        const accessToken = body.access_token?.trim();
        if (!accessToken) {
          throw new BadRequestException('Meta did not return an access token');
        }

        this.logger.info(
          {
            operation: 'exchangeCodeForAccessToken',
            metaEndpoint: '/oauth/access_token',
            httpStatus: response.status,
            usedRedirectUri: Boolean(candidate),
          },
          'Meta OAuth code exchanged for access token',
        );

        return accessToken;
      } catch (err) {
        lastError = err;
      }
    }

    mapMetaGraphError(lastError, 'Failed to exchange Meta OAuth code');
  }

  async getPhoneNumberStatus(accessToken: string, phoneNumberId: string): Promise<MetaPhoneNumberStatus> {
    try {
      const response = await this.http.get<{
        status?: string;
        code_verification_status?: string;
        display_phone_number?: string;
        error?: { message?: string; code?: number };
      }>(`/${phoneNumberId.trim()}`, {
        params: {
          fields: 'status,code_verification_status,display_phone_number',
        },
        headers: this.authHeaders(accessToken),
      });

      const body = assertMetaGraphSuccess(
        response.status,
        response.data,
        'Failed to fetch WhatsApp phone number status',
      );
      return {
        status: String(body.status ?? ''),
        codeVerificationStatus: body.code_verification_status,
        displayPhoneNumber: body.display_phone_number,
      };
    } catch (err) {
      mapMetaGraphError(err, 'Failed to fetch WhatsApp phone number status');
    }
  }

  async subscribeAppToWaba(accessToken: string, wabaId: string): Promise<MetaSubscribeAppResult> {
    try {
      const response = await this.http.post<{ success?: boolean; error?: { message?: string; code?: number } }>(
        `/${wabaId.trim()}/subscribed_apps`,
        {},
        { headers: this.authHeaders(accessToken) },
      );

      const body = assertMetaGraphSuccess(
        response.status,
        response.data,
        'Failed to subscribe app to WhatsApp Business Account',
      );

      this.logger.info(
        {
          operation: 'subscribeAppToWaba',
          metaEndpoint: `/${wabaId.trim()}/subscribed_apps`,
          httpStatus: response.status,
          success: body.success,
        },
        'App subscribed to WhatsApp Business Account webhooks',
      );

      return { success: Boolean(body.success) };
    } catch (err) {
      mapMetaGraphError(err, 'Failed to subscribe app to WhatsApp Business Account');
    }
  }

  async registerPhoneNumber(accessToken: string, phoneNumberId: string, pin: string): Promise<MetaRegisterPhoneResult> {
    try {
      const response = await this.http.post<{ success?: boolean; error?: { message?: string; code?: number } }>(
        `/${phoneNumberId.trim()}/register`,
        {
          messaging_product: 'whatsapp',
          pin: pin.trim(),
        },
        {
          headers: this.authHeaders(accessToken),
        },
      );

      const body = assertMetaGraphSuccess(response.status, response.data, 'Failed to register WhatsApp phone number');
      if (!body.success) {
        throw new BadRequestException('Meta did not confirm WhatsApp phone number registration');
      }

      const status = await this.getPhoneNumberStatus(accessToken, phoneNumberId);

      this.logger.info(
        {
          operation: 'registerPhoneNumber',
          metaEndpoint: `/${phoneNumberId.trim()}/register`,
          httpStatus: response.status,
          phoneStatus: status.status,
        },
        'WhatsApp phone number registered with Cloud API',
      );

      return { success: true, status: status.status || 'CONNECTED' };
    } catch (err) {
      mapMetaGraphError(err, 'Failed to register WhatsApp phone number');
    }
  }

  private async postMessage(
    credentials: MetaGraphCredentials,
    payload: Record<string, unknown>,
  ): Promise<MetaSendMessageResult> {
    try {
      const response = await this.http.post<MetaMessagesResponse>(`/${credentials.phoneNumberId}/messages`, payload, {
        headers: this.authHeaders(credentials.accessToken),
      });

      const body = assertMetaGraphSuccess(response.status, response.data, 'Failed to send WhatsApp message');
      const messageId = body.messages?.[0]?.id;
      if (!messageId) {
        throw new BadRequestException('Meta did not return a WhatsApp message ID');
      }

      this.logger.info(
        {
          operation: 'sendMessage',
          metaEndpoint: `/${credentials.phoneNumberId}/messages`,
          httpStatus: response.status,
          messageId,
        },
        'WhatsApp message sent',
      );

      return { messageId };
    } catch (err) {
      mapMetaGraphError(err, 'Failed to send WhatsApp message');
    }
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }
}
