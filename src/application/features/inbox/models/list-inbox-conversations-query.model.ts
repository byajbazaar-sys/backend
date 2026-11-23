import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { EInboxChannel, EInboxConversationState } from '../enums';

export class ListInboxConversationsQueryModel {
  @Expose()
  @ApiPropertyOptional({ enum: EInboxConversationState })
  @IsOptional()
  @IsEnum(EInboxConversationState)
  state?: EInboxConversationState;
  @Expose() @ApiPropertyOptional({ enum: EInboxChannel }) @IsOptional() @IsEnum(EInboxChannel) channel?: EInboxChannel;
  @Expose() @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @Expose()
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
