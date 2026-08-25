import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { WhatsAppWebhookAckResponseModel } from './models';
import { IWhatsAppWebhookService, WHATSAPP_WEBHOOK_SERVICE } from './service';

@ApiTags('webhooks')
@Controller('webhooks/whatsapp')
@UseGuards(ThrottlerGuard)
export class WhatsAppWebhookController {
  constructor(
    @Inject(WHATSAPP_WEBHOOK_SERVICE) private readonly webhookService: IWhatsAppWebhookService,
    @InjectPinoLogger(WhatsAppWebhookController.name) private readonly logger: PinoLogger,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Meta WhatsApp webhook verification challenge' })
  @ApiQuery({ name: 'hub.mode', required: false })
  @ApiQuery({ name: 'hub.verify_token', required: false })
  @ApiQuery({ name: 'hub.challenge', required: false })
  @HttpCode(HttpStatus.OK)
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res({ passthrough: false }) res: Response,
  ): void {
    const verifiedChallenge = this.webhookService.verifySubscription(mode, verifyToken, challenge);
    res.status(HttpStatus.OK).type('text/plain').send(verifiedChallenge);
  }

  @Post()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({
    summary: 'Meta WhatsApp webhook receiver (signature verified when configured)',
    description:
      'Receives WhatsApp Cloud API webhook events (messages, delivery statuses, etc.). ' +
      'Meta sends `object: whatsapp_business_account` payloads with nested `entry[].changes[]`. ' +
      'Subscribe to the **messages** field in Meta App Dashboard → WhatsApp → Configuration.',
  })
  @ApiHeader({ name: 'x-hub-signature-256', required: false })
  @ApiOkResponse({ type: WhatsAppWebhookAckResponseModel })
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string,
    @Body() _body: unknown,
  ): Promise<WhatsAppWebhookAckResponseModel> {
    const rawBody =
      req.rawBody?.toString('utf8') || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

    try {
      const result = await this.webhookService.handleWebhook(rawBody, signature);
      return plainToInstance(WhatsAppWebhookAckResponseModel, result, { excludeExtraneousValues: true });
    } catch (err) {
      this.logger.error({ err }, 'WhatsApp webhook endpoint failure');
      throw err;
    }
  }
}
