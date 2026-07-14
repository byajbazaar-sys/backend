import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EUserType } from '@shared-libs';
import { Expose, Type } from 'class-transformer';

export class LoginResponseModel {
  @Expose()
  @ApiPropertyOptional({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp...',
    description: 'Full access JWT — only present when subscription is active (or admin)',
    nullable: true,
  })
  accessToken?: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Short-lived JWT scoped to payment endpoints when subscription is required',
    nullable: true,
  })
  paymentToken?: string | null;

  @Expose()
  @ApiProperty({
    example: false,
    description: 'True when inventory and billing features require an active subscription or trial',
  })
  requiresSubscription: boolean;

  @Expose()
  @ApiPropertyOptional({ example: null, nullable: true })
  subscriptionStatus?: string | null;

  @Expose()
  @ApiProperty({ example: 'c05a6914-52fd-46be-b5d9-6ec6ae327e2c' })
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
  @ApiProperty({ example: EUserType.User, enum: EUserType })
  userType: EUserType;

  @Expose()
  @ApiProperty({ example: true })
  isEmailVerified: boolean;

  @Expose()
  @ApiProperty({ example: 'https://example.com/profile.jpg', nullable: true })
  profilePhotoUrl: string;

  @Expose()
  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  @Type(() => Date)
  lastLoginAt: Date;

  @Expose()
  @ApiProperty({
    example: true,
    description:
      "True only when this successful auth was the user's first login; the stored flag is set to false after this response.",
  })
  isFirstLogin: boolean;
}
