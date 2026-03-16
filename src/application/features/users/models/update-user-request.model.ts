import { ApiProperty } from '@nestjs/swagger';
import { EUserType, NAME_REGEX, NAME_MIN_LENGTH, NAME_MAX_LENGTH, PHONE_E164_REGEX } from '@shared-libs';
import { IsOptional, IsString, IsBoolean, IsEnum, MinLength, MaxLength, Matches } from 'class-validator';

export class UpdateUserRequestModel {
  @ApiProperty({ example: 'John', required: false, description: 'User first name' })
  @IsOptional()
  @IsString({ message: 'First name must be a string' })
  @MinLength(NAME_MIN_LENGTH, { message: `First name must be at least ${NAME_MIN_LENGTH} characters long` })
  @MaxLength(NAME_MAX_LENGTH, { message: `First name cannot exceed ${NAME_MAX_LENGTH} characters` })
  @Matches(NAME_REGEX, { message: 'First name can only contain letters, spaces, hyphens, and apostrophes' })
  firstName?: string;

  @ApiProperty({ example: 'Doe', required: false, description: 'User last name' })
  @IsOptional()
  @IsString({ message: 'Last name must be a string' })
  @MinLength(NAME_MIN_LENGTH, { message: `Last name must be at least ${NAME_MIN_LENGTH} characters long` })
  @MaxLength(NAME_MAX_LENGTH, { message: `Last name cannot exceed ${NAME_MAX_LENGTH} characters` })
  @Matches(NAME_REGEX, { message: 'Last name can only contain letters, spaces, hyphens, and apostrophes' })
  lastName?: string;

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

  @ApiProperty({ example: true, required: false, description: 'User active status' })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean value' })
  isActive?: boolean;

  @ApiProperty({ example: EUserType.Admin, enum: EUserType, required: false, description: 'User role' })
  @IsOptional()
  @IsEnum(EUserType, { message: 'User type must be either admin or user' })
  userType?: EUserType;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    required: false,
    description: 'Profile photo file (JPEG, PNG, WebP) - maximum 5MB',
  })
  @IsOptional()
  profilePhoto?: Express.Multer.File;

  @ApiProperty({
    example: 'ABC Corporation',
    required: false,
    nullable: true,
    description: 'Business name (optional)',
  })
  @IsOptional()
  @IsString({ message: 'Business name must be a string' })
  businessName?: string;

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
