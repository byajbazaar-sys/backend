import { BadRequestException } from '@nestjs/common';
import { Plan } from '../domain';
import { IPlansRepository } from '../service/i-plans.repository';

export async function requireCheckoutPlan(plansRepo: IPlansRepository): Promise<Plan> {
  const plan = await plansRepo.findActiveDefault();
  if (!plan) {
    throw new BadRequestException(
      'No active subscription plan is configured. Please contact support.',
    );
  }
  if (!plan.providerPlanId?.trim()) {
    throw new BadRequestException('Active subscription plan is not linked to Razorpay.');
  }
  if (Number(plan.price) <= 0) {
    throw new BadRequestException('Active subscription plan has an invalid price.');
  }
  if (plan.interval !== 'monthly' || (plan.intervalCount ?? 1) !== 1) {
    throw new BadRequestException('Only monthly subscription plans are available.');
  }
  return plan;
}
