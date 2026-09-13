import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class ConnectWhatsAppBusinessRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiPropertyOptional({
    description:
      'WhatsApp Business Account ID from Embedded Signup. Omit when the browser could not receive it — the server resolves it from the granted token.',
  })
  @IsOptional()
  @IsString()
  wabaId?: string;

  @ApiPropertyOptional({
    description:
      'Phone number ID from Embedded Signup. Omit when the browser could not receive it — the server resolves it from the WABA.',
  })
  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @ApiPropertyOptional({
    description: 'Short-lived OAuth code from Meta Embedded Signup — exchanged server-side',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description: 'Redirect URI used during Embedded Signup — required when exchanging code',
  })
  @IsOptional()
  @IsString()
  redirectUri?: string;

  @ApiPropertyOptional({
    description: 'Short-lived access token — only when Meta returns a token directly (legacy/dev)',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsString()
  displayPhoneNumber?: string;

  @ApiPropertyOptional({ example: 'ABC Jewellers' })
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiPropertyOptional({
    description:
      'Six-digit two-step verification PIN — registers the phone with Meta Cloud API (sets PIN if new, must match if existing). Optional when onboardingSessionId is supplied.',
    example: '123456',
  })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'registrationPin must be a 6-digit number' })
  registrationPin?: string;

  @ApiPropertyOptional({
    description:
      'Onboarding session id returned by POST /whatsapp/onboarding-session — carries the PIN across the Meta OAuth redirect.',
  })
  @IsOptional()
  @IsString()
  onboardingSessionId?: string;
}
