import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class CurrentMetalRatesResponseModel {
  @ApiPropertyOptional({ example: 7200 })
  @Expose()
  gold24?: number;

  @ApiPropertyOptional({ example: 6600 })
  @Expose()
  gold22?: number;

  @ApiPropertyOptional({ example: 6000 })
  @Expose()
  gold20?: number;

  @ApiPropertyOptional({ example: 5400 })
  @Expose()
  gold18?: number;

  @ApiPropertyOptional({ example: 95 })
  @Expose()
  silver999?: number;

  @ApiPropertyOptional({ example: 88 })
  @Expose()
  silver925?: number;

  @ApiPropertyOptional()
  @Expose()
  gold24UpdatedAt?: string;

  @ApiPropertyOptional()
  @Expose()
  gold22UpdatedAt?: string;

  @ApiPropertyOptional()
  @Expose()
  gold20UpdatedAt?: string;

  @ApiPropertyOptional()
  @Expose()
  gold18UpdatedAt?: string;

  @ApiPropertyOptional()
  @Expose()
  silver999UpdatedAt?: string;

  @ApiPropertyOptional()
  @Expose()
  silver925UpdatedAt?: string;
}
