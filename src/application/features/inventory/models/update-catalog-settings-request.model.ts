import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCatalogSettingsRequestModel {
  @ApiPropertyOptional({ description: 'Enable or disable the public catalog' })
  @IsOptional()
  @IsBoolean()
  catalogEnabled?: boolean;
}
