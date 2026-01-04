import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsMongoId } from 'class-validator';

export class GetLoanParamsModel {
  @ApiProperty({ description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsMongoId({ message: 'id must be a valid MongoDB ObjectId' })
  id: string;
}

