import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

export class InboxFaqModel {
  @Expose()
  @ApiProperty({ example: 'Do you buy old gold?' })
  @IsString()
  @MaxLength(300)
  question: string;

  @Expose()
  @ApiProperty({ example: "Yes — we exchange old gold at today's rate after testing it in the shop." })
  @IsString()
  @MaxLength(1000)
  answer: string;
}
