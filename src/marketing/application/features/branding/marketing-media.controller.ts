import { Controller, Get, Header, Inject, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import sharp from 'sharp';

import { MarketingBrandingService } from './marketing-branding.service';
import { BrandedImageQueryModel } from './models/branded-image-query.model';
import { IMarketingFileStorage, MARKETING_FILE_STORAGE } from '../../shared';
import { MarketingPublishingService } from '../instagram/service/marketing-publishing.service';

@ApiTags('marketing')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('marketing/media')
export class MarketingMediaController {
  constructor(
    private readonly publishing: MarketingPublishingService,
    private readonly branding: MarketingBrandingService,
    @Inject(MARKETING_FILE_STORAGE) private readonly storage: IMarketingFileStorage,
  ) {}

  @Get('image')
  @ApiOperation({ summary: 'A finished photo as JPEG, with the shop logo on the top-left when it is switched on' })
  @ApiProduces('image/jpeg')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async image(@Identity() identity: IIdentity, @Query() query: BrandedImageQueryModel): Promise<StreamableFile> {
    const { assetKey } = await this.publishing.resolveSource(identity.userId, { ...query, mediaType: 'IMAGE' });
    const original = await this.storage.readAsync(assetKey);
    const { image, branded } = await this.branding.apply(identity.userId, original, query.logo);
    // Always JPEG: keeps the response well inside the API's payload limit.
    const jpeg = branded ? image : await sharp(image).rotate().jpeg({ quality: 92 }).toBuffer();
    return new StreamableFile(jpeg, { type: 'image/jpeg', disposition: 'inline', length: jpeg.length });
  }
}
