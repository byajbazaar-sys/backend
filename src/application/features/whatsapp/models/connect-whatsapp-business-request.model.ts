import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ConnectWhatsAppBusinessRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({ description: 'WhatsApp Business Account ID from Meta Embedded Signup' })
  @IsString()
  @IsNotEmpty()
  wabaId: string;

  @ApiProperty({ description: 'Phone number ID from Meta Embedded Signup' })
  @IsString()
  @IsNotEmpty()
  phoneNumberId: string;

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
}
