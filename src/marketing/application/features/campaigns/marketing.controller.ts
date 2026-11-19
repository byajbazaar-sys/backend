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
import { EUserType, Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
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
import { MARKETING_ADMIN_GROUP } from '../../shared/utils/customer-text';
/** Admins also get the raw render details (pipeline wording, render account, notebook); customers get neutral text. */
const groupsFor = (identity?: IIdentity): string[] =>
  identity?.userType === EUserType.Admin ? [MARKETING_ADMIN_GROUP] : [];
const out = <T>(cls: new () => T, value: unknown, identity?: IIdentity): T =>
  plainToInstance(cls, value, { excludeExtraneousValues: true, groups: groupsFor(identity) });

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
    return out(MarketingCampaignResponseModel, await this.campaigns.create(identity.userId, body), identity);
  }

  @Get('campaigns')
  async list(@Identity() identity: IIdentity) {
    return (await this.campaigns.list(identity.userId)).map((c) => out(MarketingCampaignResponseModel, c, identity));
  }

  @Get('campaigns/:id')
  async get(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string) {
    return out(MarketingCampaignResponseModel, await this.campaigns.get(identity.userId, id), identity);
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
      identity,
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
