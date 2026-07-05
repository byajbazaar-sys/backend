import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ApiConfigurationResponseModel {
  @ApiProperty()
  @Expose()
  apiKey: string;

  @ApiProperty()
  @Expose()
  isActive: boolean;

  @ApiPropertyOptional()
  @Expose()
  createdAt?: Date;

  @ApiPropertyOptional()
  @Expose()
  lastUsedAt?: Date | null;
}

export class GenerateApiCredentialsRequestModel {
  @ApiPropertyOptional({ description: 'Required when regenerating existing credentials' })
  @IsOptional()
  @IsBoolean()
  confirmRegenerate?: boolean;
}

export class GenerateApiCredentialsResponseModel {
  @ApiProperty()
  @Expose()
  apiKey: string;

  @ApiProperty({ description: 'Shown only once. Store securely.' })
  @Expose()
  apiSecret: string;

  @ApiProperty()
  @Expose()
  isActive: boolean;

  @ApiPropertyOptional()
  @Expose()
  createdAt?: Date;
}

export class UpdateApiStatusRequestModel {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class ApiTokenResponseModel {
  @ApiProperty()
  @Expose()
  accessToken: string;

  @ApiProperty({ description: 'Token lifetime in seconds' })
  @Expose()
  expiresIn: number;
}
