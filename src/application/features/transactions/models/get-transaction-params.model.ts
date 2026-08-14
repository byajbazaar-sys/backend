import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class GetTransactionParamsModel {
  @Expose()
  @ApiProperty({ description: 'Transaction ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id: string;
}
