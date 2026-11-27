import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';

import { AiConfig } from '../../ai.config';
import { AiActor } from '../domain';
import {
  AiChatRequestModel,
  ConfirmAiActionRequestModel,
  ListAiConversationsQueryModel,
  UpdateAiPreferencesModel,
} from '../models/ai-requests.model';
import { AI_LANGUAGE_MODEL, AI_PREFERENCES_REPOSITORY, IAiLanguageModel, IAiPreferencesRepository } from '../ports';
import { AiActionsService, AiConversationsService, AiKnowledgeService, AiOrchestratorService } from '../services';

/** The signed-in person in the shop they work in (X-Shop-Id) — resolved by UserAuthGuard, never by the model. */
export function actorFrom(identity: IIdentity): AiActor {
  return {
    shopId: identity.userId,
    actorUserId: identity.actorUserId ?? identity.userId,
    shopRole: identity.shopRole ?? 'owner',
    permissions: identity.shopPermissions ?? null,
  };
}

/**
 * ByajBazaar AI. Every member of a shop can talk to it; each tool checks the module it touches against the person's
 * role (the API's per-request shop check lets `ai/*` through for that reason). Conversations and previews belong to
 * the person who made them, in that shop.
 */
@ApiTags('ai')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly config: AiConfig,
    private readonly orchestrator: AiOrchestratorService,
    private readonly actions: AiActionsService,
    private readonly conversations: AiConversationsService,
    private readonly knowledge: AiKnowledgeService,
    @Inject(AI_LANGUAGE_MODEL) private readonly llm: IAiLanguageModel,
    @Inject(AI_PREFERENCES_REPOSITORY) private readonly preferences: IAiPreferencesRepository,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether the assistant is available, and its limits' })
  status() {
    return {
      available: this.llm.configured,
      knowledge: this.knowledge.available,
      maxMessageChars: this.config.limits.maxMessageChars,
      dailyMessages: this.config.limits.dailyMessages,
    };
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a message; returns the reply, result cards and previews awaiting confirmation' })
  chat(@Identity() identity: IIdentity, @Body() body: AiChatRequestModel) {
    return this.orchestrator.chat(actorFrom(identity), body);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Your conversations in this shop, latest first' })
  list(@Identity() identity: IIdentity, @Query() query: ListAiConversationsQueryModel) {
    return this.conversations.list(
      actorFrom(identity),
      query.limit ?? 20,
      query.before ? new Date(query.before) : undefined,
    );
  }

  @Get('conversations/:id')
  get(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.conversations.get(actorFrom(identity), id);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a conversation (its messages; open previews are cancelled)' })
  async delete(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.conversations.delete(actorFrom(identity), id);
  }

  @Get('actions/:id')
  getAction(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.actions.get(actorFrom(identity), id);
  }

  @Post('actions/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm a preview: runs that exact payload once' })
  confirm(
    @Identity() identity: IIdentity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ConfirmAiActionRequestModel,
  ) {
    return this.actions.confirm(actorFrom(identity), id, body.payloadHash);
  }

  @Post('actions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.actions.cancel(actorFrom(identity), id);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Your assistant usage (and the shop total for its owner)' })
  usage(@Identity() identity: IIdentity) {
    return this.conversations.usageFor(actorFrom(identity));
  }

  @Get('preferences')
  @ApiOperation({ summary: 'How you want the assistant to answer (all shops)' })
  getPreferences(@Identity() identity: IIdentity) {
    return this.preferences.get(actorFrom(identity).actorUserId);
  }

  @Put('preferences')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Save your assistant preferences' })
  savePreferences(@Identity() identity: IIdentity, @Body() body: UpdateAiPreferencesModel) {
    return this.preferences.save(actorFrom(identity).actorUserId, {
      language: body.language,
      replyStyle: body.replyStyle,
    });
  }
}
