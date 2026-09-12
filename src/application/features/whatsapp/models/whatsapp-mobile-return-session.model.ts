import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

import { WhatsAppConnectionResponseModel } from './whatsapp-connection-response.model';

export class CreateWhatsAppMobileReturnSessionRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  businessId: string;
}

export class CreateWhatsAppMobileReturnSessionResponseModel {
  @ApiProperty({ example: 'a1b2c3d4e5f6g7h8' })
  @Expose()
  sessionId: string;

  @ApiProperty({ example: 600 })
  @Expose()
  expiresInSeconds: number;
}

export class ResolveWhatsAppMobileReturnSessionQueryModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  businessId: string;
}

export class ResolveWhatsAppMobileReturnSessionResponseModel {
  @ApiProperty({
    enum: ['connected', 'processing', 'expired', 'invalid'],
    example: 'connected',
  })
  @Expose()
  status: 'connected' | 'processing' | 'expired' | 'invalid';

  @ApiPropertyOptional({ type: WhatsAppConnectionResponseModel })
  @Expose()
  connection?: WhatsAppConnectionResponseModel | null;
}

export class WhatsAppMobileReturnSessionParamModel {
  @ApiProperty({ description: 'Opaque mobile return session id from web onboarding' })
  @Expose()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_-]{16,64}$/)
  sessionId: string;
}
