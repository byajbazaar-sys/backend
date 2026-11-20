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
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EUserType, Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import {
  AdScriptResponseModel,
  CreateVoiceoverRequestModel,
  SpokenShopNameRequestModel,
  SpokenShopNameResponseModel,
  VoiceoverResponseModel,
  VoiceoverSettingsRequestModel,
  WriteAdScriptRequestModel,
} from './models';
import { MarketingVoiceoverService } from './service';
import { AdScriptStyle } from './utils';
import { MARKETING_ADMIN_GROUP } from '../../shared/utils/customer-text';

/** Admins also get the raw render details; customers get neutral text. */
const out = (value: unknown, identity: IIdentity): VoiceoverResponseModel =>
  plainToInstance(VoiceoverResponseModel, value, {
    excludeExtraneousValues: true,
    groups: identity.userType === EUserType.Admin ? [MARKETING_ADMIN_GROUP] : [],
  });

@ApiTags('marketing')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('marketing/voiceovers')
export class MarketingVoiceoverController {
  constructor(private readonly voiceovers: MarketingVoiceoverService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Text to speech in the voice of a sample (23 languages, ChatterBox Multilingual)' })
  async create(@Identity() identity: IIdentity, @Body() body: CreateVoiceoverRequestModel) {
    return out(await this.voiceovers.create(identity.userId, body), identity);
  }

  @Post('script')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Write an ad script for an inventory item (English / Hindi / Hinglish); new every call' })
  async script(@Identity() identity: IIdentity, @Body() body: WriteAdScriptRequestModel) {
    return plainToInstance(
      AdScriptResponseModel,
      await this.voiceovers.writeScript(identity.userId, body.inventoryItemId, body.style as AdScriptStyle),
      { excludeExtraneousValues: true },
    );
  }

  @Get('shop-name')
  @ApiOperation({ summary: 'How the shop name is said in Hindi / Hinglish voiceovers' })
  async shopName(@Identity() identity: IIdentity) {
    return plainToInstance(SpokenShopNameResponseModel, await this.voiceovers.shopName(identity.userId), {
      excludeExtraneousValues: true,
    });
  }

  @Put('shop-name')
  @ApiOperation({ summary: 'Set how the voice says the shop name (Devanagari); empty lets the model write it' })
  async setShopName(@Identity() identity: IIdentity, @Body() body: SpokenShopNameRequestModel) {
    return plainToInstance(
      SpokenShopNameResponseModel,
      await this.voiceovers.setSpokenShopName(identity.userId, body.spokenName),
      { excludeExtraneousValues: true },
    );
  }

  @Get()
  async list(@Identity() identity: IIdentity) {
    return (await this.voiceovers.list(identity.userId)).map((v) => out(v, identity));
  }

  @Get(':id')
  async get(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string) {
    return out(await this.voiceovers.get(identity.userId, id), identity);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.voiceovers.remove(identity.userId, id);
  }

  @Post(':id/regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'New take of a voiceover (new seed unless given; settings may change)' })
  async regenerate(
    @Identity() identity: IIdentity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: VoiceoverSettingsRequestModel,
  ) {
    return out(await this.voiceovers.regenerate(identity.userId, id, body), identity);
  }
}
