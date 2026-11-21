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
  @Expose() @ApiProperty({ description: 'Shop logo on exported photos (top-left)' }) logoOverlay: boolean;
  @Expose()
  @ApiPropertyOptional({ description: 'The logo used on photos: the profile logo, else the generated one' })
  overlayLogoUrl?: string;
  @Expose() @ApiPropertyOptional({ enum: ['profile', 'generated'] }) overlayLogoSource?: string;
  @Expose()
  @ApiPropertyOptional({ description: 'The logo as placed on photos (margins trimmed), small PNG data URL' })
  overlayLogoPreview?: string;
  @Expose()
  @ApiPropertyOptional({ description: 'The logo sits on a light card (it has transparency)' })
  overlayLogoCard?: boolean;
}
