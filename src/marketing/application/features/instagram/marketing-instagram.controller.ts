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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import {
  InstagramCaptionRequestModel,
  InstagramPlacesQueryModel,
  MarketingInstagramConnectResponseModel,
  MarketingInstagramConnectionResponseModel,
  MarketingScheduledPostResponseModel,
  ScheduleMarketingPostRequestModel,
} from './models';
import { CaptionView, MarketingCaptionService, MarketingInstagramService, MarketingPublishingService } from './service';

@ApiTags('marketing')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('marketing/instagram')
export class MarketingInstagramController {
  constructor(
    private readonly instagram: MarketingInstagramService,
    private readonly publishing: MarketingPublishingService,
    private readonly captions: MarketingCaptionService,
  ) {}

  @Get()
  @ApiOkResponse({ type: MarketingInstagramConnectionResponseModel })
  async status(@Identity() identity: IIdentity): Promise<MarketingInstagramConnectionResponseModel> {
    return plainToInstance(MarketingInstagramConnectionResponseModel, await this.instagram.status(identity.userId));
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start Instagram Unified Login for this marketing account' })
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

  @Post('caption')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Write an Instagram caption with hashtags for library photos / videos (shop, location, pieces, special day)',
  })
  async caption(@Identity() identity: IIdentity, @Body() body: InstagramCaptionRequestModel): Promise<CaptionView> {
    return this.captions.write(identity.userId, body);
  }

  @Get('places')
  @ApiOperation({ summary: 'Search places to tag as the post location' })
  async places(@Identity() identity: IIdentity, @Query() query: InstagramPlacesQueryModel) {
    return this.publishing.searchPlaces(identity.userId, query.q);
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelPost(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.publishing.cancel(identity.userId, id);
  }
}
