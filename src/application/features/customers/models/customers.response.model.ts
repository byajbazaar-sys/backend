import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class CustomerResponseModel {
  @Expose()
  @ApiProperty({ description: 'Unique identifier of the customer', example: '507f1f77bcf86cd799439011' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'User ID of the customer', example: '507f1f77bcf86cd799439011' })
  userId: string;

  @Expose()
  @ApiProperty({ description: 'First name of the customer', example: 'John' })
  firstName: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Middle name of the customer', example: 'William' })
  middleName?: string;

  @Expose()
  @ApiProperty({ description: 'Last name of the customer', example: 'Doe' })
  lastName: string;

  @Expose()
  @ApiProperty({ description: 'Email address of the customer', example: 'john.doe@example.com' })
  email: string;

  @Expose()
  @ApiProperty({ description: 'Phone number of the customer', example: '+1234567890' })
  phone: string;

  @Expose()
  @ApiPropertyOptional({ description: 'URL of the profile photo', example: 'https://example.com/profile.jpg' })
  profilePhotoUrl?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'URL of the Aadhaar card document', example: 'https://example.com/aadhaar.jpg' })
  aadhaarCardUrl?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'URL of the PAN card document', example: 'https://example.com/pan.jpg' })
  panCardUrl?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Location of the customer', example: 'Mumbai, India' })
  location?: string;

  @Expose()
  @ApiProperty({ description: 'Date when the customer was created', type: Date })
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Date when the customer was last updated', type: Date })
  @Type(() => Date)
  updatedAt: Date;
}