import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsMongoId } from 'class-validator';
import { Expose } from 'class-transformer';

export class GetLoanItemParamsModel {
    @Expose()
    @ApiProperty({ description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
    @IsString()
    @IsMongoId()
    loanId: string;

    @Expose()
    @ApiProperty({ description: 'Loan Item ID', example: '507f1f77bcf86cd799439011' })
    @IsString()
    @IsMongoId()
    itemId: string;
}
