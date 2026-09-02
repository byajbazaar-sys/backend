import { BadRequestException } from '@nestjs/common';

import { Plan } from '../domain';
import { IPlansRepository } from '../service/i-plans.repository';

function assertValidCheckoutPlan(plan: Plan | null, planId?: string): Plan {
  if (!plan) {
    throw new BadRequestException(
      planId
        ? 'Selected subscription plan is not available.'
        : 'No active subscription plan is configured. Please contact support.',
    );
  }
  if (!plan.active) {
    throw new BadRequestException('Selected subscription plan is not active.');
  }
  if (!plan.providerPlanId?.trim()) {
    throw new BadRequestException('Selected subscription plan is not linked to Razorpay.');
  }
  if (Number(plan.price) <= 0) {
    throw new BadRequestException('Selected subscription plan has an invalid price.');
  }
  const interval = plan.interval?.trim().toLowerCase();
  const intervalCount = plan.intervalCount ?? 1;
  const isMonthly = interval === 'monthly' && intervalCount === 1;
  const isYearly = interval === 'yearly' && intervalCount === 1;
  if (!isMonthly && !isYearly) {
    throw new BadRequestException('Only monthly and yearly subscription plans are available.');
  }
  return plan;
}

export async function resolveCheckoutPlan(plansRepo: IPlansRepository, planId?: string): Promise<Plan> {
  if (planId?.trim()) {
    const plan = await plansRepo.findById(planId.trim());
    return assertValidCheckoutPlan(plan, planId);
  }

  const plan = await plansRepo.findActiveDefault();
  return assertValidCheckoutPlan(plan);
}

export function subscriptionTotalCount(plan: Plan): number {
  const interval = plan.interval?.trim().toLowerCase();
  return interval === 'yearly' ? 10 : 120;
}
