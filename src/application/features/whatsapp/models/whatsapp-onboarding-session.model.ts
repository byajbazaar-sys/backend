import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateWhatsAppOnboardingSessionRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({ description: 'Six-digit two-step verification PIN used to register the phone', example: '123456' })
  @Expose()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'registrationPin must be a 6-digit number' })
  registrationPin: string;

  @ApiPropertyOptional({ description: 'True when the ByajBazaar mobile app started this onboarding' })
  @Expose()
  @IsOptional()
  @IsBoolean()
  fromMobileApp?: boolean;

  @ApiPropertyOptional({
    description:
      'Exact redirect_uri sent to the Meta OAuth dialog — replayed verbatim during code exchange.',
  })
  @Expose()
  @IsOptional()
  @IsString()
  redirectUri?: string;
}

export class CreateWhatsAppOnboardingSessionResponseModel {
  @ApiProperty({ description: 'Opaque session id — passed to Meta as the OAuth state parameter' })
  @Expose()
  sessionId: string;

  @ApiProperty({ example: 1200 })
  @Expose()
  expiresInSeconds: number;
}

export class GetWhatsAppOnboardingSessionResponseModel {
  @ApiProperty({ example: true })
  @Expose()
  exists: boolean;

  @ApiProperty({ example: true })
  @Expose()
  fromMobileApp: boolean;
}

export class WhatsAppOnboardingSessionParamModel {
  @ApiProperty({ description: 'Opaque onboarding session id' })
  @Expose()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_-]{16,64}$/)
  sessionId: string;
}
