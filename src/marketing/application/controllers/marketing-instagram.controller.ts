import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Request, Response } from 'express';
import * as crypto from 'crypto';

import { MarketingConfig } from '../../marketing.config';
import {
  MarketingInstagramConnectResponseModel,
  MarketingInstagramConnectionResponseModel,
  MarketingScheduledPostResponseModel,
  ScheduleMarketingPostRequestModel,
} from '../models';
import { MarketingInstagramService } from '../services/marketing-instagram.service';
import { MarketingPublishingService } from '../services/marketing-publishing.service';

@ApiTags('marketing')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('marketing/instagram')
export class MarketingInstagramController {
  constructor(
    private readonly instagram: MarketingInstagramService,
    private readonly publishing: MarketingPublishingService,
  ) {}

  @Get()
  @ApiOkResponse({ type: MarketingInstagramConnectionResponseModel })
  async status(@Identity() identity: IIdentity): Promise<MarketingInstagramConnectionResponseModel> {
    return plainToInstance(MarketingInstagramConnectionResponseModel, await this.instagram.status(identity.userId));
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start Instagram Business Login for this marketing account' })
  @ApiOkResponse({ type: MarketingInstagramConnectResponseModel })
  async connect(@Identity() identity: IIdentity): Promise<MarketingInstagramConnectResponseModel> {
    return plainToInstance(
      MarketingInstagramConnectResponseModel,
      await this.instagram.beginConnection(identity.userId),
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@Identity() identity: IIdentity): Promise<void> {
    await this.instagram.disconnect(identity.userId);
  }

  @Get('posts')
  async posts(@Identity() identity: IIdentity): Promise<MarketingScheduledPostResponseModel[]> {
    return plainToInstance(MarketingScheduledPostResponseModel, await this.publishing.list(identity.userId), {
      excludeExtraneousValues: true,
    });
  }

  @Post('posts')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Schedule a ready marketing image or reel for Instagram' })
  async schedulePost(
    @Identity() identity: IIdentity,
    @Body() body: ScheduleMarketingPostRequestModel,
  ): Promise<MarketingScheduledPostResponseModel> {
    return plainToInstance(MarketingScheduledPostResponseModel, await this.publishing.schedule(identity.userId, body), {
      excludeExtraneousValues: true,
    });
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelPost(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.publishing.cancel(identity.userId, id);
  }
}

@ApiTags('marketing')
@UseGuards(ThrottlerGuard)
@Controller('public/marketing/instagram')
export class MarketingInstagramCallbackController {
  constructor(
    private readonly instagram: MarketingInstagramService,
    private readonly config: MarketingConfig,
  ) {}

  @Get('callback')
  @ApiOperation({ summary: 'Instagram Business Login callback; validates and consumes one-time OAuth state' })
  async callback(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const outcome = await this.instagram.finishConnection(state, code, error);
    if (this.config.instagram.returnUrl) {
      const returnUrl = new URL(this.config.instagram.returnUrl);
      returnUrl.searchParams.set('instagram_connection', outcome);
      response.redirect(HttpStatus.FOUND, returnUrl.toString());
      return;
    }
    response.status(HttpStatus.OK).json({ status: outcome });
  }
}

@ApiTags('webhooks')
@UseGuards(ThrottlerGuard)
@Controller('webhooks/instagram')
export class MarketingInstagramWebhookController {
  constructor(private readonly config: MarketingConfig) {}

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
  @ApiOperation({ summary: 'Meta Instagram webhook receiver' })
  @ApiHeader({ name: 'x-hub-signature-256', required: false })
  @HttpCode(HttpStatus.OK)
  receive(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ): { received: true } {
    const rawBody =
      request.rawBody?.toString('utf8') || (typeof body === 'string' ? body : JSON.stringify(body ?? {}));
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

    return { received: true };
  }
}
