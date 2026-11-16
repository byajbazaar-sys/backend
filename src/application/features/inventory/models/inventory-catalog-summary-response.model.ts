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

  @Expose()
  @ApiPropertyOptional({ description: 'Which item details the public catalog shows' })
  display?: Record<string, boolean>;

  @Expose()
  @ApiPropertyOptional({ description: 'WhatsApp number set for enquiries (blank = shop phone)' })
  whatsappNumber?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Shop phone used when no WhatsApp number is set' })
  phoneNumber?: string;
}
