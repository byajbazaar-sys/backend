import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, IsEnum } from 'class-validator';

// Define allowed filter fields as enum for Swagger dropdown
export enum EFilterField {
  Email = 'email',
  FirstName = 'firstName',
  LastName = 'lastName',
  PhoneNumber = 'phoneNumber',
  IsActive = 'isActive',
  UserType = 'userType',
  CreatedAt = 'createdAt',
  UpdatedAt = 'updatedAt',
}

export class ListUsersQueryModel {
  @ApiPropertyOptional({ example: 1, minimum: 1, description: 'Page number (1-based)' })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value !== undefined ? Number(value) : 1))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value !== undefined ? Number(value) : 10))
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'createdAt', description: 'Sort by column name' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    enum: EFilterField,
    example: EFilterField.FirstName,
    description: 'Select field to filter by (dropdown)',
  })
  @IsOptional()
  @IsEnum(EFilterField, { message: 'Filter field must be one of the allowed fields' })
  filterField?: EFilterField;

  @ApiPropertyOptional({
    example: 'John',
    description: 'Value to filter by (use with filterField)',
  })
  @IsOptional()
  @IsString()
  filterValue?: string;
}
