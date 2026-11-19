import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class CloudflareAccountVerifyResponseModel {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() valid: boolean;
  @ApiPropertyOptional() @Expose() error?: string;
}
