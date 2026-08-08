import { Expose, Type } from 'class-transformer';

export class RazorpayCreateMonthlyPlanData {
  @Expose()
  name: string;

  @Expose()
  @Type(() => Number)
  amountPaise: number;

  @Expose()
  currency?: string;

  @Expose()
  existingPlanId?: string;
}
