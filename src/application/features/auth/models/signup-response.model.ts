import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class SignupResponseModel {
  @Expose()
  @ApiProperty({ example: 'c9e5d9d4-9f0d-4f7a-9c6c-0f2a5a88a111' })
  id: string;

  @Expose()
  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @Expose()
  @ApiProperty({ example: 'John' })
  firstName: string;

  @Expose()
  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @Expose()
  @ApiProperty({ example: '1234567890' })
  phoneNumber: string;

  @Expose()
  @ApiProperty({ example: 'user' })
  userType: string;

  @Expose()
  @ApiProperty({ example: 'https://example.com/profile.jpg', nullable: true })
  profilePhotoUrl: string;

  @Expose()
  @ApiProperty({ example: 'ABC Corporation', nullable: true, required: false, description: 'Business name' })
  businessName?: string;

  @Expose()
  @ApiProperty({
    example: '123 Main Street, City, State, ZIP Code',
    nullable: true,
    required: false,
    description: 'Business address',
  })
  address?: string;

  @Expose()
  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  @Type(() => Date)
  lastLoginAt: Date;

  @Expose()
  @ApiProperty({
    example: true,
    description:
      'New accounts start as first-login until they complete a login or email verification that issues a session.',
  })
  isFirstLogin: boolean;
}
