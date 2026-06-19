import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString, Min } from 'class-validator';
import { EMetalType } from '../../inventory/enums';

export class CreateMetalRateRequestModel {
  @ApiProperty({ enum: EMetalType, example: EMetalType.Gold })
  @IsEnum(EMetalType)
  metalType: EMetalType;

  @ApiProperty({ example: '22K' })
  @IsString()
  purity: string;

  @ApiProperty({ example: 6250 })
  @IsNumber()
  @Min(0)
  rate: number;
}
