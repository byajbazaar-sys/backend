import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class KaggleCredentialVerifyResponseModel {
  @ApiProperty() @Expose() username: string;
  @ApiProperty() @Expose() valid: boolean;
  @ApiPropertyOptional() @Expose() gpuHoursLeft: number | null;
  @ApiPropertyOptional() @Expose() error?: string;
}
