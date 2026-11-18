import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class PhotoshootShotResponseModel {
  @Expose() @ApiProperty() index: number;
  @Expose() @ApiProperty({ enum: ['present', 'closeup', 'hands', 'worn'] }) kind: string;
  @Expose() @ApiProperty() status: string;
  @Expose() @ApiPropertyOptional() imageUrl?: string;
  @Expose() @ApiPropertyOptional() error?: string;
}
