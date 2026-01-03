import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class SignupResponseModel {
  @Expose()
  @ApiProperty({ example: 'c9e5d9d4-9f0d-4f7a-9c6c-0f2a5a88a111' })
  id: string;

  @Expose()
  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @Expose()
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp...' })
  accessToken: string;

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
}
