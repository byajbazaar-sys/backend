import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class KaggleRecoveryJobModel {
  @ApiProperty() @Expose() id: string;
  @ApiPropertyOptional() @Expose() account: string | null;
  @ApiProperty() @Expose() reason: string;
}
