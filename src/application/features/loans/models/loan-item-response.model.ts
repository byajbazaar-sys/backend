import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class LoanItemResponseModel {
    @Expose()
    @ApiProperty({ description: 'Loan item ID', example: '507f1f77bcf86cd799439011' })
    id: string;

    @Expose()
    @ApiProperty({ description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
    loanId: string;

    @Expose()
    @ApiProperty({ description: 'Item ID', example: '507f1f77bcf86cd799439011' })
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
    @ApiPropertyOptional({ description: 'Image reference URL', example: 'https://s3.amazonaws.com/bucket/loans/items/...' })
    imageRef?: string;

    @Expose()
    @ApiPropertyOptional({ description: 'Current rate of item', example: 5000 })
    currentRate?: number;

    @Expose()
    @ApiProperty({ description: 'Created by user ID', example: '507f1f77bcf86cd799439011' })
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
