import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class GetWhatsAppConnectionQueryModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  businessId: string;
}

export class DisconnectWhatsAppBusinessRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @IsUUID()
  @IsNotEmpty()
  businessId: string;
}
