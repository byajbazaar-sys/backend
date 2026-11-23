import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import {
  InboxConversationResponseModel,
  InboxConversationsPagedResponseModel,
  InboxMessageResponseModel,
  InboxReplyRequestModel,
  InboxSettingsResponseModel,
  InboxSummaryResponseModel,
  ListInboxConversationsQueryModel,
  ListInboxMessagesQueryModel,
  UpdateInboxConversationRequestModel,
  UpdateInboxSettingsRequestModel,
} from './models';
import { IInboxService, INBOX_SERVICE } from './service';

const out = <T>(model: new () => T, value: unknown): T =>
  plainToInstance(model, value, { excludeExtraneousValues: true });

/** The business owner's customer inbox (WhatsApp + Instagram) and the automatic-reply settings. */
@ApiTags('inbox')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('inbox')
export class InboxController {
  constructor(@Inject(INBOX_SERVICE) private readonly inbox: IInboxService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Automatic-reply settings and the state of each channel' })
  @ApiResponse({ status: HttpStatus.OK, type: InboxSettingsResponseModel })
  async getSettings(@Identity() identity: IIdentity): Promise<InboxSettingsResponseModel> {
    return out(InboxSettingsResponseModel, await this.inbox.getSettings(identity.userId));
  }

  @Put('settings')
  @ApiOperation({ summary: 'Change the automatic-reply settings (only the fields sent)' })
  @ApiResponse({ status: HttpStatus.OK, type: InboxSettingsResponseModel })
  async updateSettings(
    @Identity() identity: IIdentity,
    @Body() body: UpdateInboxSettingsRequestModel,
  ): Promise<InboxSettingsResponseModel> {
    return out(InboxSettingsResponseModel, await this.inbox.updateSettings(identity.userId, body));
  }

  @Get('summary')
  @ApiOperation({ summary: 'Conversations waiting for a reply, and unread messages (for the badge)' })
  @ApiResponse({ status: HttpStatus.OK, type: InboxSummaryResponseModel })
  async summary(@Identity() identity: IIdentity): Promise<InboxSummaryResponseModel> {
    return out(InboxSummaryResponseModel, await this.inbox.summary(identity.userId));
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Customer conversations, newest first' })
  @ApiResponse({ status: HttpStatus.OK, type: InboxConversationsPagedResponseModel })
  async list(
    @Identity() identity: IIdentity,
    @Query() query: ListInboxConversationsQueryModel,
  ): Promise<InboxConversationsPagedResponseModel> {
    return out(InboxConversationsPagedResponseModel, await this.inbox.listConversations(identity.userId, query));
  }

  @Get('conversations/:id')
  @ApiResponse({ status: HttpStatus.OK, type: InboxConversationResponseModel })
  async get(
    @Identity() identity: IIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InboxConversationResponseModel> {
    return out(InboxConversationResponseModel, await this.inbox.getConversation(identity.userId, id));
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Messages of a conversation, oldest first (pass `before` for older ones)' })
  @ApiResponse({ status: HttpStatus.OK, type: [InboxMessageResponseModel] })
  async messages(
    @Identity() identity: IIdentity,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListInboxMessagesQueryModel,
  ): Promise<InboxMessageResponseModel[]> {
    const messages = await this.inbox.listMessages(identity.userId, id, query.before, query.limit);
    return messages.map((message) => out(InboxMessageResponseModel, message));
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reply to the customer; the assistant stays quiet in this conversation afterwards' })
  @ApiResponse({ status: HttpStatus.CREATED, type: InboxMessageResponseModel })
  async reply(
    @Identity() identity: IIdentity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: InboxReplyRequestModel,
  ): Promise<InboxMessageResponseModel> {
    return out(InboxMessageResponseModel, await this.inbox.reply(identity.userId, id, body.text));
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Hand the conversation back to the assistant (auto) or keep it for you (needs_reply)' })
  @ApiResponse({ status: HttpStatus.OK, type: InboxConversationResponseModel })
  async update(
    @Identity() identity: IIdentity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateInboxConversationRequestModel,
  ): Promise<InboxConversationResponseModel> {
    return out(InboxConversationResponseModel, await this.inbox.setState(identity.userId, id, body.state));
  }

  @Post('conversations/:id/read')
  @ApiResponse({ status: HttpStatus.OK, type: InboxConversationResponseModel })
  @HttpCode(HttpStatus.OK)
  async read(
    @Identity() identity: IIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InboxConversationResponseModel> {
    return out(InboxConversationResponseModel, await this.inbox.markRead(identity.userId, id));
  }
}
