import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class CheckoutPlanResponseModel {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ example: 'Ad-Free Monthly' })
  name!: string;

  @Expose()
  @ApiProperty({ example: 48 })
  price!: number;

  @Expose()
  @ApiProperty({ example: 'INR' })
  currency!: string;

  @Expose()
  @ApiProperty({ example: 'monthly', enum: ['monthly', 'yearly'] })
  interval!: string;

  @Expose()
  @ApiProperty({ example: 1 })
  intervalCount!: number;
}
