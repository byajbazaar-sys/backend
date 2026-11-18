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
    description: 'Exact redirect_uri sent to the Meta OAuth dialog — replayed verbatim during code exchange.',
  })
  @Expose()
  @IsOptional()
  @IsString()
  redirectUri?: string;
}
