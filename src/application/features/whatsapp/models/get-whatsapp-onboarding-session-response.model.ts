import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class GetWhatsAppOnboardingSessionResponseModel {
  @ApiProperty({ example: true })
  @Expose()
  exists: boolean;

  @ApiProperty({ example: true })
  @Expose()
  fromMobileApp: boolean;
}
