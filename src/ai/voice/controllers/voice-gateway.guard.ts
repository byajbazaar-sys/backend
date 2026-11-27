import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';

import { AiConfig } from '../../ai.config';
import { verifyVoiceTicket } from '../domain/voice-ticket';
import { VoiceTicketClaims } from '../domain/voice.types';

export type VoiceGatewayRequest = Request & { voice?: VoiceTicketClaims };

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Calls from the Cloudflare voice gateway: its key (x-voice-gateway-key) AND a genuine, unexpired session ticket
 * (x-voice-ticket) that this API signed. The shop and person come from the ticket — the gateway cannot choose them.
 */
@Injectable()
export class AiVoiceGatewayGuard implements CanActivate {
  constructor(private readonly config: AiConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<VoiceGatewayRequest>();
    if (!this.config.voiceEnabled) {
      throw new ServiceUnavailableException({ code: 'AI_VOICE_NOT_CONFIGURED', message: 'Voice is not set up.' });
    }
    const key = request.header('x-voice-gateway-key') ?? '';
    if (!timingSafeEqual(digest(key), digest(this.config.voice.gatewayKey))) {
      throw new UnauthorizedException('Invalid voice gateway key');
    }
    const claims = verifyVoiceTicket(request.header('x-voice-ticket'), this.config.voice.ticketSecret);
    if (!claims) throw new UnauthorizedException({ code: 'AI_VOICE_TICKET_INVALID', message: 'Invalid voice ticket' });
    request.voice = claims;
    return true;
  }
}
