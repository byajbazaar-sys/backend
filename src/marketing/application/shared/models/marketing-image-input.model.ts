import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
export class MarketingImageInputModel {
  @ApiProperty({ description: 'Base64 image (optionally a data: URL), max 8 MB' })
  @IsString()
  @MaxLength(12_000_000)
  base64: string;

  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType: string;
}
