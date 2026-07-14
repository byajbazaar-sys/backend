import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PlanResponseModel {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  price!: number;

  @Expose()
  @ApiProperty()
  currency!: string;

  @Expose()
  @ApiProperty()
  interval!: string;

  @Expose()
  @ApiProperty()
  intervalCount!: number;

  @Expose()
  @ApiProperty()
  providerPlanId!: string;

  @Expose()
  @ApiProperty()
  active!: boolean;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
