import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class AppIntegrityChallengeResponseModel {
  @Expose()
  @ApiProperty({ example: 'k7dG3x...' })
  challenge!: string;

  @Expose()
  @ApiProperty({ example: 300 })
  expiresInSeconds!: number;
}
