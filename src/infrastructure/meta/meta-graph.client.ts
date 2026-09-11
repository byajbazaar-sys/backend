import { BadRequestException, Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { assertMetaGraphSuccess, mapMetaGraphError } from './meta-graph.errors';
import { buildWhatsAppSampleBillPdf } from './whatsapp-sample-bill.pdf';
import {
  IMetaGraphClient,
  MetaCreateTemplateResult,
  MetaGraphCredentials,
  MetaPhoneNumberStatus,
  MetaWhatsAppBusinessAccountInfo,
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

interface MetaMediaUploadResponse {
  id?: string;
  error?: { message?: string; code?: number };
}

interface MetaUploadSessionResponse {
  id?: string;
  error?: { message?: string; code?: number };
}

interface MetaResumableUploadResponse {
  h?: string;
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

  async sendDocumentMessage(
    credentials: MetaGraphCredentials,
    to: string,
    mediaId: string,
    filename: string,
  ): Promise<MetaSendMessageResult> {
    return this.postMessage(credentials, {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: {
        id: mediaId,
        filename,
      },
    });
  }

  async sendTemplateDocumentMessage(
    credentials: MetaGraphCredentials,
    to: string,
    templateName: string,
    languageCode: string,
    mediaId: string,
    filename: string,
    bodyParameters: string[],
  ): Promise<MetaSendMessageResult> {
    const components: Record<string, unknown>[] = [
      {
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: { id: mediaId, filename },
          },
        ],
      },
    ];

    if (bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParameters.map((text) => ({ type: 'text', text })),
      });
    }

    return this.postMessage(credentials, {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    });
  }

  async uploadMedia(
    credentials: MetaGraphCredentials,
    fileBuffer: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string> {
    try {
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('type', mimeType);
      form.append('file', fileBuffer, { filename, contentType: mimeType });

      const response = await this.http.post<MetaMediaUploadResponse>(
        `/${credentials.phoneNumberId}/media`,
        form,
        {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            ...form.getHeaders(),
          },
        },
      );

      const body = assertMetaGraphSuccess(response.status, response.data, 'Failed to upload WhatsApp media');
      const mediaId = body.id?.trim();
      if (!mediaId) {
        throw new BadRequestException('Meta did not return a WhatsApp media ID');
      }

      this.logger.info(
        {
          operation: 'uploadMedia',
          metaEndpoint: `/${credentials.phoneNumberId}/media`,
          httpStatus: response.status,
          mediaId,
          filename,
        },
        'WhatsApp media uploaded',
      );

      return mediaId;
    } catch (err) {
      mapMetaGraphError(err, 'Failed to upload WhatsApp media');
    }
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
    headerFormat?: 'DOCUMENT',
  ): Promise<MetaCreateTemplateResult> {
    const placeholderCount = (bodyText.match(/\{\{\d+\}\}/g) ?? []).length;
    const exampleValues = Array.from({ length: placeholderCount }, (_, index) => `Example ${index + 1}`);

    const components: Record<string, unknown>[] = [];
    if (headerFormat === 'DOCUMENT') {
      const samplePdf = buildWhatsAppSampleBillPdf();
      const headerHandle = await this.uploadTemplateMediaHandle(
        credentials.accessToken,
        samplePdf,
        'byajbazaar-sample-bill.pdf',
        'application/pdf',
      );
      components.push({
        type: 'HEADER',
        format: 'DOCUMENT',
        example: { header_handle: [headerHandle] },
      });
    }
    components.push({
      type: 'BODY',
      text: bodyText,
      ...(exampleValues.length ? { example: { body_text: [exampleValues] } } : {}),
    });

    const payload = {
      name,
      language,
      category,
      components,
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

  async getWhatsAppBusinessAccount(
    accessToken: string,
    wabaId: string,
  ): Promise<MetaWhatsAppBusinessAccountInfo> {
    try {
      const response = await this.http.get<{
        primary_funding_id?: string;
        currency?: string;
        error?: { message?: string; code?: number };
      }>(`/${wabaId.trim()}`, {
        params: { fields: 'primary_funding_id,currency' },
        headers: this.authHeaders(accessToken),
      });

      const body = assertMetaGraphSuccess(
        response.status,
        response.data,
        'Failed to fetch WhatsApp Business Account billing info',
      );

      return {
        primaryFundingId: body.primary_funding_id?.trim() || undefined,
        currency: body.currency?.trim() || undefined,
      };
    } catch (err) {
      mapMetaGraphError(err, 'Failed to fetch WhatsApp Business Account billing info');
    }
  }

  async getPhoneNumberStatus(accessToken: string, phoneNumberId: string): Promise<MetaPhoneNumberStatus> {
    try {
      const response = await this.http.get<{
        status?: string;
        code_verification_status?: string;
        display_phone_number?: string;
        verified_name?: string;
        name_status?: string;
        error?: { message?: string; code?: number };
      }>(`/${phoneNumberId.trim()}`, {
        params: {
          fields: 'status,code_verification_status,display_phone_number,verified_name,name_status',
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
        verifiedName: body.verified_name,
        nameStatus: body.name_status,
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

  private async uploadTemplateMediaHandle(
    accessToken: string,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<string> {
    const appId = this.options.appId.trim();
    if (!appId) {
      throw new BadRequestException('META_APP_ID is not configured');
    }

    try {
      const sessionResponse = await this.http.post<MetaUploadSessionResponse>(`/${appId}/uploads`, null, {
        params: {
          file_name: fileName,
          file_length: fileBuffer.length,
          file_type: mimeType,
        },
        headers: this.authHeaders(accessToken),
      });

      const sessionBody = assertMetaGraphSuccess(
        sessionResponse.status,
        sessionResponse.data,
        'Failed to start Meta template media upload session',
      );
      const sessionId = sessionBody.id?.trim();
      if (!sessionId) {
        throw new BadRequestException('Meta did not return a template media upload session ID');
      }

      const uploadResponse = await this.http.post<MetaResumableUploadResponse>(`/${sessionId}`, fileBuffer, {
        headers: {
          Authorization: `OAuth ${accessToken}`,
          file_offset: '0',
          'Content-Type': 'application/octet-stream',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const uploadBody = assertMetaGraphSuccess(
        uploadResponse.status,
        uploadResponse.data,
        'Failed to upload Meta template media sample',
      );
      const handle = uploadBody.h?.trim();
      if (!handle) {
        throw new BadRequestException('Meta did not return a template media handle');
      }

      this.logger.info(
        {
          operation: 'uploadTemplateMediaHandle',
          metaEndpoint: `/${sessionId}`,
          fileName,
          mimeType,
          fileLength: fileBuffer.length,
        },
        'Meta template media sample uploaded',
      );

      return handle;
    } catch (err) {
      mapMetaGraphError(err, 'Failed to upload Meta template media sample');
    }
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }
}
