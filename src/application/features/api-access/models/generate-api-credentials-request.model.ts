import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class GenerateApiCredentialsRequestModel {
  @ApiPropertyOptional({ description: 'Required when regenerating existing credentials' })
  @IsOptional()
  @IsBoolean()
  confirmRegenerate?: boolean;
}
