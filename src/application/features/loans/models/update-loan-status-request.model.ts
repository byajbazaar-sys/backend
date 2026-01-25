import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { Expose } from 'class-transformer';
import { ELoanStatus } from '../enums';

export class UpdateLoanStatusRequestModel {
    @Expose()
    @ApiProperty({
        enum: ELoanStatus,
        example: ELoanStatus.CLOSED,
        description: 'Loan status to set (Open or Closed)',
    })
    @IsEnum(ELoanStatus)
    @IsNotEmpty()
    status: ELoanStatus;
}
