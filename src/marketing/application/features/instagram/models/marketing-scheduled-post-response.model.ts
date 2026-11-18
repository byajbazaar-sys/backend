import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
export class MarketingScheduledPostResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() mediaType: string;
  @Expose() @ApiProperty() sourceType: string;
  @Expose() @ApiProperty() sourceId: string;
  @Expose() @ApiPropertyOptional() sourceIndex?: number | null;
  @Expose() @ApiProperty() sourceTitle: string;
  @Expose() @ApiProperty() caption: string;
  @Expose() @Type(() => Date) @ApiProperty() scheduledAt: Date;
  @Expose() @ApiProperty() status: string;
  @Expose() @ApiPropertyOptional() error?: string | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional() publishedAt?: Date | null;
  @Expose() @Type(() => Date) @ApiProperty() createdAt: Date;
}
