import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Response } from 'express';

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
