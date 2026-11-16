import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsString, IsOptional, IsEmail, IsBoolean, MaxLength } from 'class-validator';

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
