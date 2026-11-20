import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/** A ready-to-speak advertisement script (a different one on every call). */
export class AdScriptResponseModel {
  @Expose() @ApiProperty() text: string;
  @Expose() @ApiProperty({ enum: ['en', 'hi'], description: 'Voice language to speak it in' }) language: string;
  @Expose() @ApiProperty() style: string;
  @Expose() @ApiProperty({ description: 'A name for the voiceover (the item name)' }) title: string;
  @Expose()
  @ApiProperty({ enum: ['ai', 'template'], description: 'Written by the text model, or by the templates' })
  source: string;
  @Expose() @ApiPropertyOptional({ description: 'The shop name as the Hindi voice says it' }) spokenShopName?: string;
}
