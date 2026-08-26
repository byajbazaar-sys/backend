import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, Matches } from 'class-validator';

export class RegisterWhatsAppPhoneRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({
    description: 'Six-digit two-step verification PIN for Cloud API phone registration',
    example: '123456',
  })
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'registrationPin must be a 6-digit number' })
  registrationPin: string;
}
