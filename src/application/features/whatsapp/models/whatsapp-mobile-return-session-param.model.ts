import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
export class WhatsAppMobileReturnSessionParamModel {
  @ApiProperty({ description: 'Opaque mobile return session id from web onboarding' })
  @Expose()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_-]{16,64}$/)
  sessionId: string;
}
