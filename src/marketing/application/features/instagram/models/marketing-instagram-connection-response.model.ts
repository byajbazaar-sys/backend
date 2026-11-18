import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
export class MarketingInstagramConnectionResponseModel {
  @Expose() @ApiProperty() connected: boolean;
  @Expose() @ApiPropertyOptional({ nullable: true }) instagramUserId: string | null;
  @Expose() @ApiPropertyOptional({ nullable: true }) username: string | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional({ nullable: true }) tokenExpiresAt: Date | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional({ nullable: true }) connectedAt: Date | null;
  @Expose() @ApiProperty() requiresReconnect: boolean;
}
