import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class InboxReplyRequestModel {
  @Expose()
  @ApiProperty({ example: 'Yes, the 18 g chain is in stock. You can see it at the shop today.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text: string;
}
