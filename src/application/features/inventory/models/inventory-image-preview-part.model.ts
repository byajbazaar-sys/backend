import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class InventoryImagePreviewPartModel {
  @ApiProperty({ description: 'Raw base64 (no data-URL prefix)' })
  @Expose()
  base64!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @Expose()
  mimeType!: string;
}
