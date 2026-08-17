import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsIn, IsString, MinLength } from 'class-validator';

import { TRY_ON_ALLOWED_IMAGE_MIME } from './try-on-image.constants';

export class TryOnImageModel {
  @Expose()
  @ApiProperty({ description: 'Base64 image data (with or without data-URL prefix)' })
  @IsString()
  @MinLength(32, { message: 'personImage / jewellery image data is required' })
  base64!: string;

  @Expose()
  @ApiProperty({ example: 'image/jpeg', enum: TRY_ON_ALLOWED_IMAGE_MIME })
  @IsString()
  @IsIn([...TRY_ON_ALLOWED_IMAGE_MIME], { message: 'invalid image type' })
  mimeType!: string;
}
