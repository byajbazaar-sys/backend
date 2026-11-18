import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class MarketingCapacityResponseModel {
  @Expose() @ApiProperty() accounts: number;
  @Expose() @ApiProperty() ready: number;
  @Expose() @ApiProperty() settingUp: number;
  @Expose() @ApiProperty() slots: number;
  @Expose() @ApiProperty() busy: number;
  @Expose() @ApiProperty() waiting: number;
}
