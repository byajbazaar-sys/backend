import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class SupportRequestResponseModel {
  @Expose()
  @ApiProperty({ description: 'Support request ID' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Contact name' })
  name: string;

  @Expose()
  @ApiProperty({ description: 'Email address' })
  email: string;

  @Expose()
  @ApiProperty({ description: 'Mobile number' })
  mobile: string;

  @Expose()
  @ApiProperty({ description: 'Message submitted' })
  message: string;

  @Expose()
  @ApiProperty({ description: 'Created at', type: Date })
  @Type(() => Date)
  createdAt: Date;
}
