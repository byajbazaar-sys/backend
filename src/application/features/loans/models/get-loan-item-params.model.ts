import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsMongoId, IsUUID } from 'class-validator';
import { Expose } from 'class-transformer';

export class GetLoanItemParamsModel {
    @Expose()
    @ApiProperty({ description: 'Loan ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
    @IsString()
    @IsUUID()
    loanId: string;

    @Expose()
    @ApiProperty({ description: 'Loan Item ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
    @IsString()
    @IsUUID()
    itemId: string;
}
