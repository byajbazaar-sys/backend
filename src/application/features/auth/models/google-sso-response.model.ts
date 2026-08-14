import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EUserType } from '@shared-libs';
import { Expose } from 'class-transformer';

export class GoogleSsoResponseModel {
  @Expose()
  @ApiPropertyOptional({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp...',
    nullable: true,
    description: 'Full access JWT when subscription is active',
  })
  accessToken?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Payment-scoped JWT when subscription checkout is required',
    nullable: true,
  })
  paymentToken?: string;

  @Expose()
  @ApiProperty({ example: false })
  requiresSubscription: boolean;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  subscriptionStatus?: string;

  @Expose()
  @ApiPropertyOptional({
    example: '/subscription',
    description: 'Suggested client redirect after SSO',
  })
  redirectPath?: string;

  @Expose()
  @ApiProperty({ example: 'c05a6914-52fd-46be-b5d9-6ec6ae327e2c' })
  id: string;

  @Expose()
  @ApiProperty({ example: 'user@gmail.com' })
  email: string;

  @Expose()
  @ApiProperty({ example: 'John' })
  firstName: string;

  @Expose()
  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @Expose()
  @ApiProperty({ example: '1234567890', nullable: true })
  phoneNumber?: string;

  @Expose()
  @ApiProperty({ example: EUserType.User, enum: EUserType })
  userType: EUserType;

  @Expose()
  @ApiProperty({ example: true })
  isEmailVerified: boolean;

  @Expose()
  @ApiProperty({ example: 'https://example.com/profile.jpg', nullable: true })
  profilePhotoUrl?: string;

  @Expose()
  @ApiProperty({ example: true, description: 'Whether this is a new user created via Google SSO' })
  isNewUser: boolean;

  @Expose()
  @ApiProperty({
    example: true,
    description:
      "True only when this successful Google sign-in was the user's first login; the stored flag is cleared after this response.",
  })
  isFirstLogin: boolean;
}
