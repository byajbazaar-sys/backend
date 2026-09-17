import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import { ConnectWhatsAppBusinessData, UpdateWhatsAppSettingsData } from './domain';
import { isUploadedPdfFile } from './utils/is-uploaded-pdf.util';
import {
  ConnectWhatsAppBusinessRequestModel,
  CreateWhatsAppTemplateRequestModel,
  DisconnectWhatsAppBusinessRequestModel,
  RegisterWhatsAppPhoneRequestModel,
  GetWhatsAppConnectionQueryModel,
  GetWhatsAppMessageStatusQueryModel,
  ListWhatsAppMessagesQueryModel,
  ListWhatsAppTemplatesQueryModel,
  SendWhatsAppDepositDocumentMessageRequestModel,
  SendWhatsAppDepositMessageRequestModel,
  SendWhatsAppTransactionDocumentMessageRequestModel,
  SendWhatsAppTransactionMessageRequestModel,
  SendWhatsAppDocumentMessageRequestModel,
  SendWhatsAppMessageRequestModel,
  SendWhatsAppTemplateMessageRequestModel,
  UpdateWhatsAppSettingsRequestModel,
  WhatsAppConnectionResponseModel,
  WhatsAppDisconnectResponseModel,
  WhatsAppMessageResponseModel,
  WhatsAppMessageDeliveryStatusResponseModel,
  WhatsAppMessagesPagedResponseModel,
  WhatsAppRegisterPhoneResponseModel,
  WhatsAppTemplateCreateResponseModel,
  WhatsAppTemplateListResponseModel,
  WhatsAppTemplateSummaryResponseModel,
  CreateWhatsAppMobileReturnSessionRequestModel,
  CreateWhatsAppMobileReturnSessionResponseModel,
  CreateWhatsAppOnboardingSessionRequestModel,
  CreateWhatsAppOnboardingSessionResponseModel,
  GetWhatsAppOnboardingSessionResponseModel,
  WhatsAppOnboardingSessionParamModel,
  ResolveWhatsAppMobileReturnSessionQueryModel,
  ResolveWhatsAppMobileReturnSessionResponseModel,
  WhatsAppMobileReturnSessionParamModel,
} from './models';
import { IWhatsAppService, WHATSAPP_SERVICE } from './service';

@ApiTags('whatsapp')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('whatsapp')
export class WhatsAppController {
  constructor(@Inject(WHATSAPP_SERVICE) private readonly whatsappService: IWhatsAppService) {}

  @Get('connection')
  @ApiOperation({ summary: 'Get WhatsApp connection status for the current business' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business (tenant) ID — must match authenticated user' })
  @ApiOkResponse({ type: WhatsAppConnectionResponseModel })
  @HttpCode(HttpStatus.OK)
  async getConnection(
    @Query() query: GetWhatsAppConnectionQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppConnectionResponseModel> {
    const connection = await this.whatsappService.getWhatsAppConnection(identity.userId, query.businessId);
    if (!connection) {
      return null;
    }
    return plainToInstance(WhatsAppConnectionResponseModel, connection, { excludeExtraneousValues: true });
  }

  @Post('connect')
  @ApiOperation({ summary: 'Store WhatsApp Business connection after Meta Embedded Signup' })
  @ApiOkResponse({ type: WhatsAppConnectionResponseModel })
  @HttpCode(HttpStatus.OK)
  async connect(
    @Body() body: ConnectWhatsAppBusinessRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppConnectionResponseModel> {
    const data = plainToInstance(
      ConnectWhatsAppBusinessData,
      {
        wabaId: body.wabaId,
        phoneNumberId: body.phoneNumberId,
        code: body.code,
        redirectUri: body.redirectUri,
        accessToken: body.accessToken,
        displayPhoneNumber: body.displayPhoneNumber,
        businessName: body.businessName,
        registrationPin: body.registrationPin,
        onboardingSessionId: body.onboardingSessionId,
      },
      { excludeExtraneousValues: true },
    );
    const connection = await this.whatsappService.connectWhatsAppBusiness(identity.userId, body.businessId, data);
    return plainToInstance(WhatsAppConnectionResponseModel, connection, { excludeExtraneousValues: true });
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update WhatsApp settings for the connected business' })
  @ApiOkResponse({ type: WhatsAppConnectionResponseModel })
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @Body() body: UpdateWhatsAppSettingsRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppConnectionResponseModel> {
    const settings = plainToInstance(
      UpdateWhatsAppSettingsData,
      {
        dueRemindersEnabled: body.dueRemindersEnabled,
      },
      { excludeExtraneousValues: true },
    );
    const connection = await this.whatsappService.updateWhatsAppSettings(
      identity.userId,
      body.businessId,
      settings,
    );
    return plainToInstance(WhatsAppConnectionResponseModel, connection, { excludeExtraneousValues: true });
  }

  @Post('onboarding-session')
  @ApiOperation({ summary: 'Start WhatsApp onboarding — stores the PIN across the Meta OAuth redirect' })
  @ApiOkResponse({ type: CreateWhatsAppOnboardingSessionResponseModel })
  @HttpCode(HttpStatus.OK)
  async createOnboardingSession(
    @Body() body: CreateWhatsAppOnboardingSessionRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<CreateWhatsAppOnboardingSessionResponseModel> {
    const result = await this.whatsappService.createWhatsAppOnboardingSession(
      identity.userId,
      body.businessId,
      body.registrationPin,
      body.fromMobileApp ?? false,
      body.redirectUri,
    );
    return plainToInstance(CreateWhatsAppOnboardingSessionResponseModel, result, {
      excludeExtraneousValues: true,
    });
  }

  @Get('onboarding-session/:sessionId')
  @ApiOperation({ summary: 'Check an onboarding session and whether the mobile app started it' })
  @ApiOkResponse({ type: GetWhatsAppOnboardingSessionResponseModel })
  @HttpCode(HttpStatus.OK)
  async getOnboardingSession(
    @Param() params: WhatsAppOnboardingSessionParamModel,
    @Identity() identity: IIdentity,
  ): Promise<GetWhatsAppOnboardingSessionResponseModel> {
    const result = await this.whatsappService.getWhatsAppOnboardingSession(
      identity.userId,
      params.sessionId,
    );
    return plainToInstance(GetWhatsAppOnboardingSessionResponseModel, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('mobile-return-session')
  @ApiOperation({ summary: 'Create a short-lived session to return to the mobile app after WhatsApp onboarding' })
  @ApiOkResponse({ type: CreateWhatsAppMobileReturnSessionResponseModel })
  @HttpCode(HttpStatus.OK)
  async createMobileReturnSession(
    @Body() body: CreateWhatsAppMobileReturnSessionRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<CreateWhatsAppMobileReturnSessionResponseModel> {
    const result = await this.whatsappService.createWhatsAppMobileReturnSession(
      identity.userId,
      body.businessId,
    );
    return plainToInstance(CreateWhatsAppMobileReturnSessionResponseModel, result, {
      excludeExtraneousValues: true,
    });
  }

  @Get('mobile-return-session/:sessionId')
  @ApiOperation({ summary: 'Resolve a mobile return session and verify WhatsApp connection server-side' })
  @ApiOkResponse({ type: ResolveWhatsAppMobileReturnSessionResponseModel })
  @HttpCode(HttpStatus.OK)
  async resolveMobileReturnSession(
    @Param() params: WhatsAppMobileReturnSessionParamModel,
    @Query() query: ResolveWhatsAppMobileReturnSessionQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<ResolveWhatsAppMobileReturnSessionResponseModel> {
    const result = await this.whatsappService.resolveWhatsAppMobileReturnSession(
      identity.userId,
      query.businessId,
      params.sessionId,
    );
    return plainToInstance(
      ResolveWhatsAppMobileReturnSessionResponseModel,
      {
        status: result.status,
        connection: result.connection
          ? plainToInstance(WhatsAppConnectionResponseModel, result.connection, {
              excludeExtraneousValues: true,
            })
          : null,
      },
      { excludeExtraneousValues: true },
    );
  }

  @Post('provision-templates')
  @ApiOperation({ summary: 'Create missing default WhatsApp message templates on the connected WABA' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  @HttpCode(HttpStatus.OK)
  async provisionTemplates(
    @Body() body: DisconnectWhatsAppBusinessRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<{ success: boolean }> {
    await this.whatsappService.provisionWhatsAppDefaultTemplates(identity.userId, body.businessId);
    return { success: true };
  }

  @Post('register-phone')
  @ApiOperation({ summary: 'Register connected WhatsApp phone number with Meta Cloud API' })
  @ApiOkResponse({ type: WhatsAppRegisterPhoneResponseModel })
  @HttpCode(HttpStatus.OK)
  async registerPhone(
    @Body() body: RegisterWhatsAppPhoneRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppRegisterPhoneResponseModel> {
    const result = await this.whatsappService.registerWhatsAppPhone(
      identity.userId,
      body.businessId,
      body.registrationPin,
    );
    return plainToInstance(WhatsAppRegisterPhoneResponseModel, result, { excludeExtraneousValues: true });
  }

  @Post('disconnect')
  @ApiOperation({ summary: 'Disconnect WhatsApp for the current business' })
  @ApiOkResponse({ type: WhatsAppDisconnectResponseModel })
  @HttpCode(HttpStatus.OK)
  async disconnect(
    @Body() body: DisconnectWhatsAppBusinessRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppDisconnectResponseModel> {
    const result = await this.whatsappService.disconnectWhatsAppBusiness(identity.userId, body.businessId);
    return plainToInstance(WhatsAppDisconnectResponseModel, result, { excludeExtraneousValues: true });
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a WhatsApp text message via Meta Cloud API' })
  @ApiOkResponse({ type: WhatsAppMessageResponseModel })
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Body() body: SendWhatsAppMessageRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppMessageResponseModel> {
    const result = await this.whatsappService.sendTextMessage(
      identity.userId,
      body.businessId,
      body.to,
      body.text.body,
      {
        reengagementTemplateName: body.reengagementTemplateName,
        reengagementTemplateLanguage: body.reengagementTemplateLanguage,
      },
    );
    return plainToInstance(WhatsAppMessageResponseModel, result, { excludeExtraneousValues: true });
  }

  @Get('messages')
  @ApiOperation({ summary: 'List outbound WhatsApp message history for the connected business' })
  @ApiOkResponse({ type: WhatsAppMessagesPagedResponseModel })
  @HttpCode(HttpStatus.OK)
  async listMessages(
    @Query() query: ListWhatsAppMessagesQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppMessagesPagedResponseModel> {
    const paged = await this.whatsappService.listMessageHistory(identity.userId, query.businessId, {
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
      recipient: query.recipient,
      deliveryStatus: query.deliveryStatus,
      contextType: query.contextType,
    });
    return plainToInstance(WhatsAppMessagesPagedResponseModel, paged, { excludeExtraneousValues: true });
  }

  @Get('messages/:messageId')
  @ApiOperation({ summary: 'Get WhatsApp message delivery status (updated via Meta webhooks)' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business (tenant) ID — must match authenticated user' })
  @ApiOkResponse({ type: WhatsAppMessageDeliveryStatusResponseModel })
  @HttpCode(HttpStatus.OK)
  async getMessageStatus(
    @Param('messageId') messageId: string,
    @Query() query: GetWhatsAppMessageStatusQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppMessageDeliveryStatusResponseModel> {
    const message = await this.whatsappService.getMessageDeliveryStatus(identity.userId, query.businessId, messageId);
    return plainToInstance(
      WhatsAppMessageDeliveryStatusResponseModel,
      {
        messageId: message.metaMessageId,
        deliveryStatus: message.deliveryStatus,
        recipient: message.recipient,
        statusTimestamp: message.statusTimestamp,
        errorCode: message.errorCode,
        errorTitle: message.errorTitle,
        errorMessage: message.errorMessage,
      },
      { excludeExtraneousValues: true },
    );
  }

  @Post('messages/document')
  @ApiOperation({ summary: 'Send a bill PDF to a customer via WhatsApp Cloud API (document attachment only)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiBody({
    schema: {
      type: 'object',
      required: ['businessId', 'to', 'shopName', 'file'],
      properties: {
        businessId: { type: 'string', format: 'uuid' },
        to: { type: 'string', example: '919827258776' },
        shopName: { type: 'string', example: 'Shree Jewellers' },
        billNumber: { type: 'string', example: 'INV-1024' },
        customerName: { type: 'string', example: 'Rahul Sharma' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: WhatsAppMessageResponseModel })
  @HttpCode(HttpStatus.OK)
  async sendDocumentMessage(
    @Body() body: SendWhatsAppDocumentMessageRequestModel,
    @UploadedFile() file: Express.Multer.File,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppMessageResponseModel> {
    if (!isUploadedPdfFile(file)) {
      throw new BadRequestException('PDF file is required');
    }

    const billLabelParts: string[] = [];
    if (body.billNumber?.trim()) billLabelParts.push(body.billNumber.trim());
    if (body.customerName?.trim()) {
      billLabelParts.push(
        billLabelParts.length > 0
          ? `→ ${body.customerName.trim()}`
          : body.customerName.trim(),
      );
    }

    const result = await this.whatsappService.sendBillPdfDocument(
      identity.userId,
      body.businessId,
      body.to,
      file.buffer,
      file.originalname || 'bill.pdf',
      file.mimetype,
      body.shopName,
      {
        contextLabel: billLabelParts.length > 0 ? billLabelParts.join(' ') : undefined,
      },
    );
    return plainToInstance(WhatsAppMessageResponseModel, result, { excludeExtraneousValues: true });
  }

  @Post('messages/deposit')
  @ApiOperation({ summary: 'Notify a customer about a deposit transaction via WhatsApp (text or approved template)' })
  @ApiOkResponse({ type: WhatsAppMessageResponseModel })
  @HttpCode(HttpStatus.OK)
  async sendDepositMessage(
    @Body() body: SendWhatsAppDepositMessageRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppMessageResponseModel> {
    const result = await this.whatsappService.sendDepositNotificationMessage(
      identity.userId,
      body.businessId,
      body.to,
      body.shopName,
      {
        amount: body.amount,
        depositNumber: body.depositNumber,
        transactionType: body.transactionType,
        balanceAfter: body.balanceAfter,
        receiptNumber: body.receiptNumber,
        transactionDate: body.transactionDate,
        customerName: body.customerName,
        depositAccountId: body.depositAccountId,
      },
    );
    return plainToInstance(WhatsAppMessageResponseModel, result, { excludeExtraneousValues: true });
  }

  @Post('messages/deposit-document')
  @ApiOperation({ summary: 'Send a deposit receipt PDF to a customer via WhatsApp Cloud API' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiBody({
    schema: {
      type: 'object',
      required: ['businessId', 'to', 'shopName', 'file'],
      properties: {
        businessId: { type: 'string', format: 'uuid' },
        to: { type: 'string', example: '919827258776' },
        shopName: { type: 'string', example: 'Shree Jewellers' },
        depositNumber: { type: 'string', example: 'DEP-1024' },
        receiptNumber: { type: 'string', example: 'RCP-2048' },
        customerName: { type: 'string', example: 'Rahul Sharma' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: WhatsAppMessageResponseModel })
  @HttpCode(HttpStatus.OK)
  async sendDepositDocumentMessage(
    @Body() body: SendWhatsAppDepositDocumentMessageRequestModel,
    @UploadedFile() file: Express.Multer.File,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppMessageResponseModel> {
    if (!isUploadedPdfFile(file)) {
      throw new BadRequestException('PDF file is required');
    }

    const depositLabelParts: string[] = [];
    if (body.receiptNumber?.trim()) depositLabelParts.push(body.receiptNumber.trim());
    if (body.depositNumber?.trim()) {
      depositLabelParts.push(
        depositLabelParts.length > 0
          ? `· ${body.depositNumber.trim()}`
          : body.depositNumber.trim(),
      );
    }
    if (body.customerName?.trim()) {
      depositLabelParts.push(
        depositLabelParts.length > 0
          ? `→ ${body.customerName.trim()}`
          : body.customerName.trim(),
      );
    }

    const result = await this.whatsappService.sendDepositPdfDocument(
      identity.userId,
      body.businessId,
      body.to,
      file.buffer,
      file.originalname || 'deposit-receipt.pdf',
      file.mimetype,
      body.shopName,
      {
        contextLabel: depositLabelParts.length > 0 ? depositLabelParts.join(' ') : undefined,
      },
    );
    return plainToInstance(WhatsAppMessageResponseModel, result, { excludeExtraneousValues: true });
  }

  @Post('messages/transaction')
  @ApiOperation({ summary: 'Notify a customer about a loan payment via WhatsApp (text or approved template)' })
  @ApiOkResponse({ type: WhatsAppMessageResponseModel })
  @HttpCode(HttpStatus.OK)
  async sendTransactionMessage(
    @Body() body: SendWhatsAppTransactionMessageRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppMessageResponseModel> {
    const result = await this.whatsappService.sendTransactionNotificationMessage(
      identity.userId,
      body.businessId,
      body.to,
      body.shopName,
      {
        amount: body.amount,
        loanNumber: body.loanNumber,
        transactionType: body.transactionType,
        paidIn: body.paidIn,
        paymentDate: body.paymentDate,
        customerName: body.customerName,
        transactionId: body.transactionId,
      },
    );
    return plainToInstance(WhatsAppMessageResponseModel, result, { excludeExtraneousValues: true });
  }

  @Post('messages/transaction-document')
  @ApiOperation({ summary: 'Send a loan payment receipt PDF to a customer via WhatsApp Cloud API' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiBody({
    schema: {
      type: 'object',
      required: ['businessId', 'to', 'shopName', 'file'],
      properties: {
        businessId: { type: 'string', format: 'uuid' },
        to: { type: 'string', example: '919827258776' },
        shopName: { type: 'string', example: 'Shree Jewellers' },
        loanNumber: { type: 'string', example: 'LN-1024' },
        receiptNumber: { type: 'string', example: 'TX-A1B2C3D4' },
        customerName: { type: 'string', example: 'Rahul Sharma' },
        transactionId: { type: 'string', format: 'uuid' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: WhatsAppMessageResponseModel })
  @HttpCode(HttpStatus.OK)
  async sendTransactionDocumentMessage(
    @Body() body: SendWhatsAppTransactionDocumentMessageRequestModel,
    @UploadedFile() file: Express.Multer.File,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppMessageResponseModel> {
    if (!isUploadedPdfFile(file)) {
      throw new BadRequestException('PDF file is required');
    }

    const transactionLabelParts: string[] = [];
    if (body.receiptNumber?.trim()) transactionLabelParts.push(body.receiptNumber.trim());
    if (body.loanNumber?.trim()) {
      transactionLabelParts.push(
        transactionLabelParts.length > 0
          ? `· ${body.loanNumber.trim()}`
          : body.loanNumber.trim(),
      );
    }
    if (body.customerName?.trim()) {
      transactionLabelParts.push(
        transactionLabelParts.length > 0
          ? `→ ${body.customerName.trim()}`
          : body.customerName.trim(),
      );
    }

    const result = await this.whatsappService.sendTransactionPdfDocument(
      identity.userId,
      body.businessId,
      body.to,
      file.buffer,
      file.originalname || 'payment-receipt.pdf',
      file.mimetype,
      body.shopName,
      {
        contextId: body.transactionId?.trim() || undefined,
        contextLabel: transactionLabelParts.length > 0 ? transactionLabelParts.join(' ') : undefined,
      },
    );
    return plainToInstance(WhatsAppMessageResponseModel, result, { excludeExtraneousValues: true });
  }

  @Post('messages/template')
  @ApiOperation({ summary: 'Send a WhatsApp template message via Meta Cloud API' })
  @ApiOkResponse({ type: WhatsAppMessageResponseModel })
  @HttpCode(HttpStatus.OK)
  async sendTemplateMessage(
    @Body() body: SendWhatsAppTemplateMessageRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppMessageResponseModel> {
    const result = await this.whatsappService.sendTemplateMessage(
      identity.userId,
      body.businessId,
      body.to,
      body.templateName,
      body.languageCode,
      body.parameters,
    );
    return plainToInstance(WhatsAppMessageResponseModel, result, { excludeExtraneousValues: true });
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create a WhatsApp message template (Business Management API)' })
  @ApiOkResponse({ type: WhatsAppTemplateCreateResponseModel })
  @HttpCode(HttpStatus.OK)
  async createTemplate(
    @Body() body: CreateWhatsAppTemplateRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppTemplateCreateResponseModel> {
    const result = await this.whatsappService.createTemplate(
      identity.userId,
      body.businessId,
      body.name,
      body.language,
      body.category,
      body.bodyText,
    );
    return plainToInstance(WhatsAppTemplateCreateResponseModel, result, { excludeExtraneousValues: true });
  }

  @Get('templates')
  @ApiOperation({ summary: 'List WhatsApp message templates for the configured WABA' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business (tenant) ID — must match authenticated user' })
  @ApiOkResponse({ type: WhatsAppTemplateListResponseModel })
  @HttpCode(HttpStatus.OK)
  async listTemplates(
    @Query() query: ListWhatsAppTemplatesQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<WhatsAppTemplateListResponseModel> {
    const items = await this.whatsappService.listTemplates(identity.userId, query.businessId);
    return {
      items: plainToInstance(WhatsAppTemplateSummaryResponseModel, items, { excludeExtraneousValues: true }),
    };
  }
}
