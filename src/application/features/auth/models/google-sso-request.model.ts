import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString} from 'class-validator';

export class GoogleSsoRequestModel {
  @ApiPropertyOptional({
    example: '4/0AXXXXXX...',
    description: 'Google OAuth2 authorization code (required if accessToken not provided)',
    required: false,
  })
  @IsString({ message: 'Authorization code must be a string' })
  @IsOptional()
  authCode?: string;

  @ApiPropertyOptional({
    example: 'ya29.a0AfH6SMC...',
    description: 'Google OAuth2 access token (required if authCode not provided)',
    required: false,
  })
  @IsString({ message: 'Access token must be a string' })
  @IsOptional()
  accessToken?: string;
}
