import { ApiProperty } from '@nestjs/swagger';
import {
  EUserType,
  NAME_REGEX,
  PHONE_E164_REGEX,
  PASSWORD_COMPLEXITY_REGEX,
  NAME_MIN_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '@shared-libs';
import { IsEmail, IsString, IsOptional, IsEnum, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateUserRequestModel {
  @ApiProperty({ example: 'user@example.com', description: 'User email address (must be unique)' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsString({ message: 'Email must be a string' })
  email: string;

  @ApiProperty({ example: 'John', description: 'User first name' })
  @IsString({ message: 'First name must be a string' })
  @MinLength(NAME_MIN_LENGTH, { message: `First name must be at least ${NAME_MIN_LENGTH} characters long` })
  @MaxLength(NAME_MAX_LENGTH, { message: `First name cannot exceed ${NAME_MAX_LENGTH} characters` })
  @Matches(NAME_REGEX, { message: 'First name can only contain letters, spaces, hyphens, and apostrophes' })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'User last name' })
  @IsString({ message: 'Last name must be a string' })
  @MinLength(NAME_MIN_LENGTH, { message: `Last name must be at least ${NAME_MIN_LENGTH} characters long` })
  @MaxLength(NAME_MAX_LENGTH, { message: `Last name cannot exceed ${NAME_MAX_LENGTH} characters` })
  @Matches(NAME_REGEX, { message: 'Last name can only contain letters, spaces, hyphens, and apostrophes' })
  lastName: string;

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

  @ApiProperty({
    example: 'StrongP@ssw0rd!',
    description:
      'User password (minimum 8 characters, must contain uppercase, lowercase, number, and special character)',
  })
  @IsString({ message: 'Password must be a string' })
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters` })
  @Matches(PASSWORD_COMPLEXITY_REGEX, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  password: string;

  @ApiProperty({
    example: EUserType.User,
    enum: EUserType,
    default: EUserType.User,
    required: false,
    description: 'User role (defaults to user)',
  })
  @IsOptional()
  @IsEnum(EUserType, { message: 'User type must be either admin or user' })
  userType?: EUserType = EUserType.User;
}
