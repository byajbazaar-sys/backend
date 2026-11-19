import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { CloudflareAccountResponseModel } from './cloudflare-account-response.model';

export class BulkCreateCloudflareAccountResultModel {
  @ApiProperty() @Expose() accountId: string;
  @ApiProperty() @Expose() ok: boolean;
  @ApiPropertyOptional() @Expose() error?: string;
  @ApiPropertyOptional({ type: CloudflareAccountResponseModel })
  @Expose()
  @Type(() => CloudflareAccountResponseModel)
  account?: CloudflareAccountResponseModel;
}
