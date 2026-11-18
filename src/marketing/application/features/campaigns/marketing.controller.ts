import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import {
  CreateCampaignRequestModel,
  MarketingBrandResponseModel,
  MarketingCampaignResponseModel,
  MarketingCapacityResponseModel,
  RegenerateBrandRequestModel,
  RegenerateSceneRequestModel,
} from './models';
import { MarketingCampaignsService } from './service';
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
