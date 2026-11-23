import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { ASSIGNABLE_ROLES, AssignableRole, ShopPermissions } from '../domain';

export class CreateShopRequestModel {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  businessName: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;
}

export class CreateShopInviteRequestModel {
  @ApiProperty()
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole;

  @ApiPropertyOptional({ description: 'Per-module access on top of the role: { customers: "view", … }' })
  @IsOptional()
  @IsObject()
  permissions?: Partial<ShopPermissions>;
}

export class UpdateShopMemberRequestModel {
  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES })
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: AssignableRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  permissions?: Partial<ShopPermissions>;

  @ApiPropertyOptional({ enum: ['active', 'disabled'] })
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}

export class AcceptShopInviteRequestModel {
  @ApiProperty()
  @IsString()
  @MinLength(16)
  @MaxLength(100)
  token: string;
}
