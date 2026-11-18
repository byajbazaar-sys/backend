import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class CreateWhatsAppMobileReturnSessionResponseModel {
  @ApiProperty({ example: 'a1b2c3d4e5f6g7h8' })
  @Expose()
  sessionId: string;

  @ApiProperty({ example: 600 })
  @Expose()
  expiresInSeconds: number;
}
