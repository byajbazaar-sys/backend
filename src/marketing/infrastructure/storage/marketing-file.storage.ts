import { Injectable } from '@nestjs/common';
import { S3FileStorage } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { IMarketingFileStorage } from '../../application';
import { MarketingConfig } from '../../marketing.config';

/**
 * Marketing's own private bucket (MARKETING_S3_*): campaign / photoshoot images, clips and Reels, brand logos.
 * With MARKETING_MEDIA_CDN_URL set, reads go through the media CDN Worker (stable, edge-cached URLs); otherwise
 * signed B2 URLs. Uploads always use presigned PUT URLs.
 */
@Injectable()
export class MarketingFileStorage extends S3FileStorage implements IMarketingFileStorage {
  constructor(config: MarketingConfig, @InjectPinoLogger(MarketingFileStorage.name) logger: PinoLogger) {
    super(config.storage, logger);
  }

  // Getter (not a field): implements the abstract accessor on S3FileStorage.
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  public get isPublic(): boolean {
    return false;
  }
}
