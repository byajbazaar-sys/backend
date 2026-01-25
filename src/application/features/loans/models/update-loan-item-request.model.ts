import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, IsMongoId } from 'class-validator';
import { Expose } from 'class-transformer';

export class UpdateLoanItemRequestModel {
    @Expose()
    @ApiPropertyOptional({ description: 'Item ID', example: '507f1f77bcf86cd799439011' })
    @IsString()
    @IsOptional()
    @IsMongoId()
    itemId?: string;

    @Expose()
    @ApiPropertyOptional({ description: 'Item amount', example: 50000 })
    @IsNumber()
    @IsOptional()
    @Min(0.001)
    amount?: number;

    @Expose()
    @ApiPropertyOptional({ description: 'Item name', example: 'Gold Necklace' })
    @IsString()
    @IsOptional()
    itemName?: string;

    @Expose()
    @ApiPropertyOptional({ description: 'Item description', example: '22K gold necklace with intricate design' })
    @IsString()
    @IsOptional()
    itemDescription?: string;

    @Expose()
    @ApiPropertyOptional({ description: 'Net weight in grams', example: 50.5 })
    @IsNumber()
    @IsOptional()
    @Min(0.001)
    netWeightInGrams?: number;

    @Expose()
    @ApiPropertyOptional({ description: 'Gross weight in grams', example: 55.2 })
    @IsNumber()
    @IsOptional()
    @Min(0.001)
    grossWeightInGrams?: number;

    @Expose()
    @ApiPropertyOptional({ description: 'Current rate of item', example: 5000 })
    @IsNumber()
    @IsOptional()
    @Min(0.001)
    currentRate?: number;

    @Expose()
    @ApiPropertyOptional({
        type: 'array',
        items: {
            type: 'string',
            format: 'binary',
        },
        required: false,
        description: 'Loan item images (JPEG, PNG, WebP) - maximum 5MB',
    })
    image?: Express.Multer.File[];

    // Note: Image is handled as a file upload via multipart/form-data
    // Use the 'image' field in the form data to upload a new image
    // The image will replace the existing image if one exists
}
