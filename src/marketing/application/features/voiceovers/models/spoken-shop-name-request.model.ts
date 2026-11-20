import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class SpokenShopNameRequestModel {
  @ApiProperty({
    description: 'The shop name in Devanagari as the voice should say it; empty = let the model write it',
  })
  @IsString()
  @MaxLength(160)
  spokenName: string;
}
