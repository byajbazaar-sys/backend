import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsPhoneNumber } from 'class-validator';
import { Expose } from 'class-transformer';

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
  @ApiProperty({ description: 'Email address of the customer', example: 'john.doe@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

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
