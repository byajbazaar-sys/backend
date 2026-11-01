import { ApiPropertyOptional } from '@nestjs/swagger';
import { PHONE_E164_REGEX } from '@shared-libs';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class GoogleSsoRequestModel {
  @ApiPropertyOptional({
    example: '4/0AXXXXXX...',
    description: 'Google OAuth2 authorization code (web). Native apps must send idToken instead.',
    required: false,
  })
  @IsString({ message: 'Authorization code must be a string' })
  @MaxLength(4096)
  @IsOptional()
  authCode?: string;

  @ApiPropertyOptional({
    example: 'eyJhbGciOiJSUzI1NiIs...',
    description: 'Google ID token from native mobile sign-in',
    required: false,
  })
  @IsString({ message: 'ID token must be a string' })
  @MaxLength(8192)
  @IsOptional()
  idToken?: string;

  @ApiPropertyOptional({ description: 'One-time challenge from /auth/app-integrity/challenge (mobile only)' })
  @IsString()
  @MaxLength(256)
  @IsOptional()
  integrityChallenge?: string;

  @ApiPropertyOptional({ description: 'Google Play Integrity token (Android)' })
  @IsString()
  @MaxLength(16384)
  @IsOptional()
  integrityToken?: string;

  @ApiPropertyOptional({ description: 'App Attest key id (iOS)' })
  @IsString()
  @MaxLength(256)
  @IsOptional()
  integrityKeyId?: string;

  @ApiPropertyOptional({ description: 'App Attest attestation object on first iOS sign-in' })
  @IsString()
  @MaxLength(32768)
  @IsOptional()
  integrityAttestation?: string;

  @ApiPropertyOptional({ description: 'App Attest assertion for repeat iOS sign-ins' })
  @IsString()
  @MaxLength(16384)
  @IsOptional()
  integrityAssertion?: string;

  @ApiPropertyOptional({
    example: '+919876543210',
    description: 'Required only when this Google identity creates a new account',
  })
  @IsString()
  @Matches(PHONE_E164_REGEX)
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Verified phone proof; required only when this Google identity creates a new account',
  })
  @IsString()
  @MaxLength(4096)
  @IsOptional()
  phoneVerificationToken?: string;
}
