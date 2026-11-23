import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import * as crypto from 'crypto';
import { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { MarketingInstagramMessagingService } from './service/marketing-instagram-messaging.service';
import { MarketingConfig } from '../../../marketing.config';

@ApiTags('webhooks')
@UseGuards(ThrottlerGuard)
@Controller('webhooks/instagram')
export class MarketingInstagramWebhookController {
  constructor(
    private readonly config: MarketingConfig,
    private readonly messaging: MarketingInstagramMessagingService,
    @InjectPinoLogger(MarketingInstagramWebhookController.name) private readonly logger: PinoLogger,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Meta Instagram webhook verification challenge' })
  @ApiQuery({ name: 'hub.mode', required: false })
  @ApiQuery({ name: 'hub.verify_token', required: false })
  @ApiQuery({ name: 'hub.challenge', required: false })
  @HttpCode(HttpStatus.OK)
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res({ passthrough: false }) response: Response,
  ): void {
    const configuredToken = this.config.instagram.webhookVerifyToken;
    if (!configuredToken) {
      throw new ForbiddenException('Instagram webhook verify token is not configured');
    }
    if (mode !== 'subscribe') {
      throw new ForbiddenException('Invalid hub.mode');
    }
    if (!verifyToken || verifyToken !== configuredToken) {
      throw new ForbiddenException('Invalid verify token');
    }
    if (!challenge) {
      throw new ForbiddenException('Missing hub.challenge');
    }

    response.status(HttpStatus.OK).type('text/plain').send(challenge);
  }

  @Post()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Meta Instagram webhook receiver (customer DMs go to the inbox)' })
  @ApiHeader({ name: 'x-hub-signature-256', required: false })
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ): Promise<{ received: true }> {
    const rawBody = request.rawBody?.toString('utf8') || (typeof body === 'string' ? body : JSON.stringify(body ?? {}));
    const appSecret = this.config.instagram.appSecret;

    if (!appSecret) {
      throw new ForbiddenException('Instagram app secret is not configured');
    }
    if (!signature?.startsWith('sha256=')) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const received = signature.slice('sha256='.length);
    let valid = false;
    try {
      valid =
        received.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Always 200 once the signature is good: Meta retries failed deliveries and turns off webhooks that keep failing.
    try {
      await this.messaging.handleWebhook(JSON.parse(rawBody));
    } catch (err) {
      this.logger.error({ err }, 'Instagram webhook could not be handled');
    }
    return { received: true };
  }
}
