import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsEmail, MaxLength } from 'class-validator';

export class CreateCustomerRequestModel {
  @Expose()
  @ApiProperty({ description: 'First name of the customer', example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Middle name of the customer', example: 'William' })
  @IsString()
  @IsOptional()
  middleName?: string;

  @Expose()
  @ApiProperty({ description: 'Last name of the customer', example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Email address of the customer', example: 'john.doe@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Phone number of the customer', example: '+1234567890' })
  @IsOptional()
  @IsString()
  phone?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Alternative phone number of the customer', example: '+0987654321' })
  @IsOptional()
  @IsString()
  alternativePhone?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Location of the customer', example: 'Mumbai, India' })
  @IsString()
  @IsOptional()
  location?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'GSTIN of the customer' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  gstin?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'PAN number of the customer' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  panNumber?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'State of the customer' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'GST state code of the customer' })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  stateCode?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Proprietor / firm name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  propName?: string;

  @Expose()
  @ApiProperty({
    type: 'string',
    format: 'binary',
    required: false,
    description: 'profilePhoto file (JPEG, PNG, WebP) - maximum 5MB',
  })
  @IsOptional()
  profilePhoto?: Express.Multer.File;

  @Expose()
  @ApiProperty({
    type: 'string',
    format: 'binary',
    required: false,
    description: 'Aadhar card file (JPEG, PNG, WebP) - maximum 5MB',
  })
  @IsOptional()
  aadharCard?: Express.Multer.File;

  @Expose()
  @ApiProperty({
    type: 'string',
    format: 'binary',
    required: false,
    description: 'PAN card file (JPEG, PNG, WebP) - maximum 5MB',
  })
  @IsOptional()
  panCard?: Express.Multer.File;
}
