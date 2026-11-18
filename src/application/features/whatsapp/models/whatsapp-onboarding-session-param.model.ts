import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
export class WhatsAppOnboardingSessionParamModel {
  @ApiProperty({ description: 'Opaque onboarding session id' })
  @Expose()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_-]{16,64}$/)
  sessionId: string;
}
