import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { EUserType } from '@shared-libs';

export class GoogleSsoResponseModel {
  @Expose()
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp...' })
  accessToken: string;

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
}
