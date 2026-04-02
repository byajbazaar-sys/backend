import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsBoolean } from 'class-validator';
import { Expose, Transform } from 'class-transformer';

export class UpdateCustomerRequestModel {
  @Expose()
  @ApiPropertyOptional({ description: 'First name of the customer', example: 'John' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Middle name of the customer', example: 'William' })
  @IsString()
  @IsOptional()
  middleName?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Last name of the customer', example: 'Doe' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Email address of the customer', example: 'john.doe@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Phone number of the customer', example: '+1234567890' })
  @IsString()
  @IsOptional()
  phone?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Alternative phone number of the customer', example: '+0987654321' })
  @IsString()
  @IsOptional()
  alternativePhone?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Location of the customer', example: 'Mumbai, India' })
  @IsString()
  @IsOptional()
  location?: string;

  @Expose()
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile photo file (JPEG, PNG, WebP) - maximum 5MB',
  })
  @IsOptional()
  profilePhoto?: Express.Multer.File;

  @Expose()
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Aadhar card file (JPEG, PNG, WebP) - maximum 5MB',
  })
  @IsOptional()
  aadharCard?: Express.Multer.File;

  @Expose()
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'PAN card file (JPEG, PNG, WebP) - maximum 5MB',
  })
  @IsOptional()
  panCard?: Express.Multer.File;

  @Expose()
  @Transform(({ value }) => value === true || value === 'true')
  @ApiPropertyOptional({
    description: 'If true, deletes the stored Aadhaar card from storage and clears aadhaarCardRef',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  removeAadharCard?: boolean;

  @Expose()
  @Transform(({ value }) => value === true || value === 'true')
  @ApiPropertyOptional({
    description: 'If true, deletes the stored PAN card from storage and clears panCardRef',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  removePanCard?: boolean;
}
