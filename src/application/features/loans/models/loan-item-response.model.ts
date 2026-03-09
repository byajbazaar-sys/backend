import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class LoanItemResponseModel {
    @Expose()
    @ApiProperty({ description: 'Loan item ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
    id: string;

    @Expose()
    @ApiProperty({ description: 'Loan ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
    loanId: string;

    @Expose()
    @ApiProperty({ description: 'Item ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
    itemId: string;

    @Expose()
    @ApiProperty({ description: 'Item amount', example: 50000 })
    amount: number;

    @Expose()
    @ApiProperty({ description: 'Item name', example: 'Gold Necklace' })
    itemName: string;

    @Expose()
    @ApiPropertyOptional({ description: 'Item description', example: '22K gold necklace with intricate design' })
    itemDescription?: string;

    @Expose()
    @ApiProperty({ description: 'Net weight in grams', example: 50.5 })
    netWeightInGrams: number;

    @Expose()
    @ApiProperty({ description: 'Gross weight in grams', example: 55.2 })
    grossWeightInGrams: number;

    @Expose()
    @ApiPropertyOptional({ description: 'Signed URL for item image (presigned, time-limited)', example: 'https://bucket.s3.region.amazonaws.com/loans/items/...?X-Amz-...' })
    imageRef?: string;

    @Expose()
    @ApiPropertyOptional({ description: 'Current rate of item', example: 5000 })
    currentRate?: number;

    @Expose()
    @ApiProperty({ description: 'Created by user ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
    createdBy?: string;

    @Expose()
    @ApiProperty({ description: 'Created at timestamp', type: Date })
    @Type(() => Date)
    createdAt?: Date;

    @Expose()
    @ApiProperty({ description: 'Updated at timestamp', type: Date })
    @Type(() => Date)
    updatedAt?: Date;
}
