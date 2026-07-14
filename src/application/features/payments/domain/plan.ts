import { Expose } from 'class-transformer';

export class Plan {
  @Expose()
  id?: string;

  @Expose()
  name!: string;

  @Expose()
  price!: number;

  @Expose()
  currency!: string;

  @Expose()
  interval!: string;

  @Expose()
  intervalCount!: number;

  @Expose()
  providerPlanId!: string;

  @Expose()
  active!: boolean;

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;
}
