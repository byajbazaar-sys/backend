import { BadRequestException, Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';

import { LabelDesignerSettingsService } from './label-designer-settings.service';
import type { LabelDesignerSettingsResponse } from './service';
import { SaveLabelDesignerSettingsModel } from './models/save-label-designer-settings.model';

const MAX_SETTINGS_BYTES = 4 * 1024 * 1024;

@ApiTags('label-designer')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('label-designer/settings')
export class LabelDesignerSettingsController {
  constructor(private readonly settingsService: LabelDesignerSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get jewellery label templates and printer profiles for the authenticated shop' })
  @ApiOkResponse({ description: 'Label designer settings snapshot.' })
  get(@Identity() identity: IIdentity): Promise<LabelDesignerSettingsResponse> {
    return this.settingsService.get(identity.userId);
  }

  @Put()
  @ApiOperation({ summary: 'Replace jewellery label templates and printer profiles for the authenticated shop' })
  @ApiOkResponse({ description: 'Saved label designer settings snapshot.' })
  save(
    @Body() settings: SaveLabelDesignerSettingsModel,
    @Identity() identity: IIdentity,
  ): Promise<LabelDesignerSettingsResponse> {
    if (Buffer.byteLength(JSON.stringify(settings), 'utf8') > MAX_SETTINGS_BYTES) {
      throw new BadRequestException('Label designer settings exceed the 4 MB limit.');
    }
    return this.settingsService.save(identity.userId, settings);
  }
}

