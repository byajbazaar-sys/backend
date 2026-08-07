import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class InventoryImagePreviewPartModel {
  @ApiProperty({ description: 'Raw base64 (no data-URL prefix)' })
  @Expose()
  base64!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @Expose()
  mimeType!: string;
}

export class InventoryImageAiPreviewResponseModel {
  @ApiPropertyOptional({ type: InventoryImagePreviewPartModel })
  @Expose()
  @Type(() => InventoryImagePreviewPartModel)
  original?: InventoryImagePreviewPartModel;

  @ApiProperty({ type: InventoryImagePreviewPartModel })
  @Expose()
  @Type(() => InventoryImagePreviewPartModel)
  aiGenerated!: InventoryImagePreviewPartModel;
}
