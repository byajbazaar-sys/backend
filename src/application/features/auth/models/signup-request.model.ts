import { ApiProperty } from '@nestjs/swagger';
import { NAME_REGEX, PHONE_E164_REGEX, PASSWORD_COMPLEXITY_REGEX } from '@shared-libs';
import { Expose } from 'class-transformer';
import { IsEmail, IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';

export class SignupRequestModel {
  @Expose()
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address (must be unique)',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsString({ message: 'Email must be a string' })
  email: string;

  @Expose()
  @ApiProperty({
    example: 'John',
    description: 'User first name',
  })
  @IsString({ message: 'First name must be a string' })
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(50, { message: 'First name cannot exceed 50 characters' })
  @Matches(NAME_REGEX, { message: 'First name can only contain letters, spaces, hyphens, and apostrophes' })
  firstName: string;

  @Expose()
  @ApiProperty({
    example: 'Doe',
    description: 'User last name',
  })
  @IsString({ message: 'Last name must be a string' })
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Last name cannot exceed 50 characters' })
  @Matches(NAME_REGEX, { message: 'Last name can only contain letters, spaces, hyphens, and apostrophes' })
  lastName: string;

  @Expose()
  @ApiProperty({
    example: '+15550000000',
    required: false,
    nullable: true,
    description: 'User phone number (optional)',
  })
  @IsOptional()
  @IsString({ message: 'Phone number must be a string' })
  @Matches(PHONE_E164_REGEX, { message: 'Please provide a valid phone number in international format' })
  phoneNumber?: string;

  @Expose()
  @ApiProperty({
    example: 'StrongP@ssw0rd!',
    description:
      'User password (minimum 8 characters, must contain uppercase, lowercase, number, and special character)',
  })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password cannot exceed 128 characters' })
  @Matches(PASSWORD_COMPLEXITY_REGEX, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  password: string;

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
    example: 'ABC Corporation',
    required: false,
    nullable: true,
    description: 'Business name (optional)',
  })
  @IsOptional()
  @IsString({ message: 'Business name must be a string' })
  businessName?: string;

  @Expose()
  @ApiProperty({
    example: '123 Main Street, City, State, ZIP Code',
    required: false,
    nullable: true,
    description: 'Business address (optional)',
  })
  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  address?: string;
}
