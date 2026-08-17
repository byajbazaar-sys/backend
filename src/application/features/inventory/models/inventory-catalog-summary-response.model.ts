import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

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
