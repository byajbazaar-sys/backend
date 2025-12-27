import { ApiProperty } from '@nestjs/swagger';
import { EUserType } from '@shared-libs';
import { IsEnum } from 'class-validator';

export class UpdateUserTypeRequestModel {
  @ApiProperty({ example: EUserType.Admin, enum: EUserType, description: 'New user type/role' })
  @IsEnum(EUserType, { message: 'User type must be either admin or user' })
  userType: EUserType;
}
