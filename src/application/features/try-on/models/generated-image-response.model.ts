import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class GeneratedImageResponseModel {
  @Expose()
  @ApiProperty()
  base64!: string;

  @Expose()
  @ApiProperty()
  mimeType!: string;
}
