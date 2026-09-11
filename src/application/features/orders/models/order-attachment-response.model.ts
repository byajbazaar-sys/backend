import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class OrderAttachmentResponseModel {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  orderId: string;

  @Expose()
  @ApiPropertyOptional()
  filename?: string;

  @Expose()
  @ApiPropertyOptional()
  mimeType?: string;

  @Expose()
  @ApiPropertyOptional()
  url?: string;

  @Expose()
  @Type(() => Date)
  @ApiProperty()
  createdAt: Date;
}
