import { ApiProperty } from '@nestjs/swagger';
import { EUserType } from '@shared-libs';
import { Expose, Type } from 'class-transformer';

export class UserResponseModel {
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
  @ApiProperty({ example: '+15550000000', nullable: true, required: false })
  phoneNumber?: string;

  @Expose()
  @ApiProperty({ example: true })
  isActive: boolean;

  @Expose()
  @ApiProperty({ example: EUserType.User, enum: EUserType })
  userType: EUserType;

  @Expose()
  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt: string;

  @Expose()
  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  updatedAt: string;
}
