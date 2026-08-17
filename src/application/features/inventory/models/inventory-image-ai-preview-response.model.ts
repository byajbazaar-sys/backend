import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { InventoryImagePreviewPartModel } from './inventory-image-preview-part.model';

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
