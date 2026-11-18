import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class CreateWhatsAppOnboardingSessionResponseModel {
  @ApiProperty({ description: 'Opaque session id — passed to Meta as the OAuth state parameter' })
  @Expose()
  sessionId: string;

  @ApiProperty({ example: 1200 })
  @Expose()
  expiresInSeconds: number;
}
