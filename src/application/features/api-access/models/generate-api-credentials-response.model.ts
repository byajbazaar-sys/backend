import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

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
