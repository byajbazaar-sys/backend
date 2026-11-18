import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class MarketingInstagramConnectResponseModel {
  @Expose() @ApiProperty() authorizationUrl: string;
}
