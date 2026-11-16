import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Request } from 'express';

import {
  CreateCampaignRequestModel,
  MarketingBrandResponseModel,
  MarketingCampaignResponseModel,
  MarketingCapacityResponseModel,
  MarketingQueueMessageModel,
  MarketingWorkerEventModel,
  RegenerateBrandRequestModel,
  RegenerateSceneRequestModel,
} from '../models';
import { IMarketingQueue, MARKETING_QUEUE } from '../ports';
import { MarketingCampaignsService } from '../services/marketing-campaigns.service';
import { MarketingQueueConsumer } from '../services/marketing-queue.consumer';
import { MarketingRenderService } from '../services/marketing-render.service';

const out = <T>(cls: new () => T, value: unknown): T => plainToInstance(cls, value, { excludeExtraneousValues: true });

@ApiTags('marketing')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('marketing')
export class MarketingController {
  constructor(private readonly campaigns: MarketingCampaignsService) {}

  @Post('campaigns')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start a campaign: 5 scene images + 5 videos (5 s) + a merged film ending on the logo' })
  async create(@Identity() identity: IIdentity, @Body() body: CreateCampaignRequestModel) {
    return out(MarketingCampaignResponseModel, await this.campaigns.create(identity.userId, body));
  }

  @Get('campaigns')
  async list(@Identity() identity: IIdentity) {
    return (await this.campaigns.list(identity.userId)).map((c) => out(MarketingCampaignResponseModel, c));
  }

  @Get('campaigns/:id')
  async get(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string) {
    return out(MarketingCampaignResponseModel, await this.campaigns.get(identity.userId, id));
  }

  @Delete('campaigns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.campaigns.remove(identity.userId, id);
  }

  @Post('campaigns/:id/scenes/:index/regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Regenerate a scene image (then its video) or only its video; the film is re-merged' })
  async regenerateScene(
    @Identity() identity: IIdentity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() body: RegenerateSceneRequestModel,
  ) {
    return out(
      MarketingCampaignResponseModel,
      await this.campaigns.regenerateScene(identity.userId, id, index, body.target),
    );
  }

  @Get('brand')
  @ApiOperation({ summary: 'Brand kit: logo image + 5 s logo video (reused at the end of every film)' })
  async brand(@Identity() identity: IIdentity) {
    return out(MarketingBrandResponseModel, await this.campaigns.brand(identity.userId));
  }

  @Post('brand/regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  async regenerateBrand(@Identity() identity: IIdentity, @Body() body: RegenerateBrandRequestModel) {
    return out(MarketingBrandResponseModel, await this.campaigns.regenerateBrand(identity.userId, body.target));
  }

  @Get('capacity')
  async capacity() {
    return out(MarketingCapacityResponseModel, await this.campaigns.capacity());
  }
}

/** HTTPS fallback for worker notebooks when the WebSocket is unavailable. Authorised by the per-job token. */
@ApiTags('marketing')
@UseGuards(ThrottlerGuard)
@Controller('public/marketing')
export class MarketingWorkerEventsController {
  constructor(private readonly render: MarketingRenderService) {}

  @Post('worker-events')
  @HttpCode(HttpStatus.NO_CONTENT)
  async workerEvent(@Body() body: MarketingWorkerEventModel): Promise<void> {
    if (!(await this.render.handleWorkerEvent(body))) throw new ForbiddenException('Invalid worker token');
  }
}

/** QStash deliveries (marketing job queue). Authorised by the Upstash-Signature header. */
@ApiTags('marketing')
@Controller('marketing/queue')
export class MarketingQueueController {
  constructor(
    private readonly consumer: MarketingQueueConsumer,
    @Inject(MARKETING_QUEUE) private readonly queue: IMarketingQueue,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async deliver(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: MarketingQueueMessageModel,
  ): Promise<{ ok: true }> {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    if (!(await this.queue.verify(req.header('upstash-signature'), raw))) {
      throw new UnauthorizedException('Invalid queue signature');
    }
    await this.consumer.deliver(body);
    return { ok: true };
  }
}
