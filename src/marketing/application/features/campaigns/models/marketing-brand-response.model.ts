import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class MarketingBrandResponseModel {
  @Expose() @ApiProperty() businessName: string;
  @Expose() @ApiProperty() logoImageStatus: string;
  @Expose() @ApiProperty() logoVideoStatus: string;
  @Expose() @ApiPropertyOptional() logoImageUrl?: string;
  @Expose()
  @ApiPropertyOptional({ description: '5 s logo clip, reused at the end of every campaign film' })
  logoVideoUrl?: string;
  @Expose() @ApiPropertyOptional() error?: string;
}
