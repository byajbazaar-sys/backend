import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Expose } from 'class-transformer';

export class UpdateCatalogSettingsRequestModel {
  @ApiPropertyOptional({ description: 'Enable or disable the public catalog' })
  @IsOptional()
  @IsBoolean()
  catalogEnabled?: boolean;
}

export class InventoryCatalogSummaryResponseModel {
  @Expose()
  @ApiPropertyOptional({ example: 'shri-rk-jewellers' })
  catalogSlug?: string;

  @Expose()
  @ApiProperty({ example: true })
  catalogEnabled: boolean;

  @Expose()
  @ApiProperty({ example: true })
  catalogActive: boolean;

  @Expose()
  @ApiProperty({ example: 'https://shri-rk-jewellers.byajbazaar.com' })
  catalogUrl?: string;

  @Expose()
  @ApiProperty({ example: 24 })
  publishedItemCount: number;

  @Expose()
  @ApiPropertyOptional({ example: 'Shri R.K. Jewellers' })
  businessName?: string;

  @Expose()
  @ApiPropertyOptional()
  slugConflict?: boolean;
}

export class BulkUpdateCatalogVisibilityRequestModel {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({ example: true })
  @IsBoolean()
  isCatalogVisible: boolean;
}

export class BulkUpdateCatalogVisibilityResponseModel {
  @Expose()
  @ApiProperty()
  updatedCount: number;
}
