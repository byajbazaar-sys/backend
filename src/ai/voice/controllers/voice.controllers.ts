import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';

import { AiVoiceGatewayGuard, VoiceGatewayRequest } from './voice-gateway.guard';
import { actorFrom } from '../../application/controllers/ai.controller';
import { AiVoiceSession, VOICE_PROTOCOL, VoiceTicketClaims } from '../domain/voice.types';
import {
  StartVoiceSessionModel,
  VoiceGatewayCloseModel,
  VoiceGatewayTurnModel,
  VoiceGatewayUsageModel,
} from '../models/voice-requests.model';
import { AiVoiceConversationService } from '../services/voice-conversation.service';
import { AiVoiceSessionsService } from '../services/voice-sessions.service';

/**
 * ByajBazaar AI voice, for the apps: start a voice session (a ticket for the Cloudflare voice gateway), refresh
 * the ticket to reconnect, end it, see today's usage. Same shop and role checks as every assistant call.
 */
@ApiTags('ai')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('ai/voice')
export class AiVoiceController {
  constructor(private readonly sessions: AiVoiceSessionsService) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether voice is available' })
  status() {
    return { available: this.sessions.available, protocol: VOICE_PROTOCOL };
  }

  @Post('sessions')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start a voice session (returns the gateway URL and a 2-minute connect ticket)' })
  start(@Identity() identity: IIdentity, @Body() body: StartVoiceSessionModel) {
    return this.sessions.start(actorFrom(identity), { conversationId: body.conversationId });
  }

  @Post('sessions/:id/ticket')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'A fresh connect ticket for an open session (reconnecting)' })
  ticket(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.sessions.ticket(actorFrom(identity), id);
  }

  @Post('sessions/:id/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  async end(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.sessions.end(actorFrom(identity), id);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Voice minutes used today (and the shop total for its owner)' })
  usage(@Identity() identity: IIdentity) {
    return this.sessions.usage(actorFrom(identity));
  }
}

/** Claims the gateway guard verified (it rejects requests without them). */
function claimsOf(request: VoiceGatewayRequest): VoiceTicketClaims {
  if (!request.voice) throw new UnauthorizedException('Invalid voice ticket');
  return request.voice;
}

/**
 * For the Cloudflare voice gateway only (its key + the session ticket, see AiVoiceGatewayGuard): each transcribed
 * turn, usage it measured, and the end of a session. No user token: the shop and person come from the ticket.
 */
@ApiExcludeController()
@UseGuards(AiVoiceGatewayGuard)
@Controller('ai/voice/gateway')
export class AiVoiceGatewayController {
  constructor(
    private readonly sessions: AiVoiceSessionsService,
    private readonly conversation: AiVoiceConversationService,
  ) {}

  @Post('turns')
  @HttpCode(HttpStatus.OK)
  turn(@Req() request: VoiceGatewayRequest, @Body() body: VoiceGatewayTurnModel) {
    return this.conversation.turn(claimsOf(request), body);
  }

  @Post('usage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async usage(@Req() request: VoiceGatewayRequest, @Body() body: VoiceGatewayUsageModel): Promise<void> {
    const session = await this.sessions.requireOpen(claimsOf(request));
    await this.sessions.addUsage(session.id, body);
  }

  @Post('close')
  @HttpCode(HttpStatus.NO_CONTENT)
  async close(@Req() request: VoiceGatewayRequest, @Body() body: VoiceGatewayCloseModel): Promise<void> {
    const session: AiVoiceSession | null = await this.sessions.requireOpen(claimsOf(request)).catch(() => null);
    if (session) await this.sessions.close(session, body.reason);
  }
}
