import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import { ConnectWhatsAppBusinessData } from './domain';
import {
  ConnectWhatsAppBusinessRequestModel,
  CreateWhatsAppTemplateRequestModel,
  DisconnectWhatsAppBusinessRequestModel,
  GetWhatsAppConnectionQueryModel,
  ListWhatsAppTemplatesQueryModel,
  SendWhatsAppMessageRequestModel,
  SendWhatsAppTemplateMessageRequestModel,
  WhatsAppConnectionResponseModel,
  WhatsAppDisconnectResponseModel,
  WhatsAppMessageResponseModel,
  WhatsAppTemplateCreateResponseModel,
  WhatsAppTemplateListResponseModel,
  WhatsAppTemplateSummaryResponseModel,
} from './models';
import { IWhatsAppService, WHATSAPP_SERVICE } from './service';

@ApiTags('whatsapp')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('whatsapp')
export class WhatsAppController {
  constructor(@Inject(WHATSAPP_SERVICE) private readonly whatsappService: IWhatsAppService) { }

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
        accessToken: body.accessToken,
        displayPhoneNumber: body.displayPhoneNumber,
        businessName: body.businessName,
      },
      { excludeExtraneousValues: true },
    );
    const connection = await this.whatsappService.connectWhatsAppBusiness(identity.userId, body.businessId, data);
    return plainToInstance(WhatsAppConnectionResponseModel, connection, { excludeExtraneousValues: true });
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
