import { ApiProperty } from '@nestjs/swagger';
import { EUserType } from '@shared-libs';
import { Expose } from 'class-transformer';

export class LoginResponseModel {
  @Expose()
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp...' })
  accessToken: string;

  @Expose()
  @ApiProperty({ example: 'c05a6914-52fd-46be-b5d9-6ec6ae327e2c' })
  _id: string;

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

  constructor(
    accessToken: string,
    id: string,
    email: string,
    firstName: string,
    lastName: string,
    phoneNumber: string,
    isEmailVerified: boolean,
    userType: EUserType,
  ) {
    this.accessToken = accessToken;
    this._id = id;
    this.email = email;
    this.firstName = firstName;
    this.lastName = lastName;
    this.phoneNumber = phoneNumber;
    this.isEmailVerified = isEmailVerified;
    this.userType = userType;
  }
}
