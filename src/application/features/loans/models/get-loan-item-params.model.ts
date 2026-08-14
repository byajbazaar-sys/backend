import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsString, IsUUID } from 'class-validator';

export class GetLoanItemParamsModel {
  @Expose()
  @ApiProperty({ description: 'Loan Item ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @IsString()
  @IsUUID()
  itemId: string;
}
