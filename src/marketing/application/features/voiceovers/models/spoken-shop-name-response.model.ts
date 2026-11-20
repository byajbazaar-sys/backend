import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/** How the shop name is said in Hindi / Hinglish voiceovers. */
export class SpokenShopNameResponseModel {
  @Expose() @ApiPropertyOptional() businessName?: string;
  @Expose() @ApiPropertyOptional({ description: 'Devanagari, as the voice says it' }) spokenName?: string;
  @Expose() @ApiProperty({ description: 'Set by the owner (never replaced automatically)' }) byUser: boolean;
}
