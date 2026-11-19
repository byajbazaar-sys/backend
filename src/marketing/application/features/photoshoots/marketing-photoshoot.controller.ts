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

import { CreatePhotoshootRequestModel, PhotoshootResponseModel } from './models';
import { MarketingPhotoshootService } from './service';
import { MARKETING_ADMIN_GROUP } from '../../shared/utils/customer-text';
/** Admins also get the raw render details; customers get neutral text. */
const out = (value: unknown, identity: IIdentity): PhotoshootResponseModel =>
  plainToInstance(PhotoshootResponseModel, value, {
    excludeExtraneousValues: true,
    groups: identity.userType === EUserType.Admin ? [MARKETING_ADMIN_GROUP] : [],
  });

@ApiTags('marketing')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('marketing/photoshoots')
export class MarketingPhotoshootController {
  constructor(private readonly photoshoots: MarketingPhotoshootService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'AI photoshoot: one product photo → 4 ad photos (model, close-up, hands, worn)' })
  async create(@Identity() identity: IIdentity, @Body() body: CreatePhotoshootRequestModel) {
    return out(await this.photoshoots.create(identity.userId, body), identity);
  }

  @Get()
  async list(@Identity() identity: IIdentity) {
    return (await this.photoshoots.list(identity.userId)).map((p) => out(p, identity));
  }

  @Get(':id')
  async get(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string) {
    return out(await this.photoshoots.get(identity.userId, id), identity);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.photoshoots.remove(identity.userId, id);
  }

  @Post(':id/shots/:index/regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'New take of one photo of the set' })
  async regenerate(
    @Identity() identity: IIdentity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return out(await this.photoshoots.regenerateShot(identity.userId, id, index), identity);
  }
}
