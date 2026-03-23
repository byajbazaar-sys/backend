import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupportRequestModel {
  @Expose()
  @ApiProperty({ description: 'Contact name', example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @Expose()
  @ApiProperty({ description: 'Email address', example: 'jane@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @Expose()
  @ApiProperty({ description: 'Mobile phone number', example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  mobile: string;

  @Expose()
  @ApiProperty({ description: 'Support message', example: 'I need help with my loan statement.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(10000)
  message: string;
}
