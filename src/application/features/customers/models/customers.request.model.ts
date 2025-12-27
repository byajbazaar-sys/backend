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
  @ApiProperty({ description: 'Phone number of the customer', example: '+1234567890' })
  @IsOptional()
  phone?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'URL of the profile photo', example: 'https://example.com/profile.jpg' })
  @IsString()
  @IsOptional()
  profilePhotoUrl?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'URL of the Aadhaar card document', example: 'https://example.com/aadhaar.jpg' })
  @IsString()
  @IsOptional()
  aadhaarCardUrl?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'URL of the PAN card document', example: 'https://example.com/pan.jpg' })
  @IsString()
  @IsOptional()
  panCardUrl?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Location of the customer', example: 'Mumbai, India' })
  @IsString()
  @IsOptional()
  location?: string;
}