import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Plan, RazorpayCreateMonthlyPlanData } from '../domain';
import { CreatePlanRequestModel, UpdatePlanRequestModel } from '../models';
import { IPlanService } from './i-plan.service';
import { IPlansRepository, PLANS_REPOSITORY } from './i-plans.repository';
import { IRazorpayService, RAZORPAY_SERVICE } from './i-razorpay.service';

@Injectable()
export class PlanService implements IPlanService {
  constructor(
    @Inject(PLANS_REPOSITORY) private readonly plansRepo: IPlansRepository,
    @Inject(RAZORPAY_SERVICE) private readonly razorpay: IRazorpayService,
  ) {}

  async list(): Promise<Plan[]> {
    return this.plansRepo.findAll();
  }

  async create(body: CreatePlanRequestModel): Promise<Plan> {
    const currency = body.currency?.trim().toUpperCase() || 'INR';
    const interval = body.interval?.trim().toLowerCase() || 'monthly';
    const intervalCount = body.intervalCount ?? 1;

    if (interval !== 'monthly' || intervalCount !== 1) {
      throw new BadRequestException('Only monthly plans with interval count 1 are supported');
    }

    const existingByName = await this.plansRepo.findByNameAndPrice(body.name.trim(), body.price);
    if (existingByName) {
      return existingByName;
    }

    if (body.providerPlanId?.trim()) {
      const existingByProvider = await this.plansRepo.findByProviderPlanId(body.providerPlanId.trim());
      if (existingByProvider) {
        return existingByProvider;
      }
    }

    const amountPaise = Math.round(body.price * 100);
    const rzpPlan = await this.razorpay.createMonthlyPlan(
      plainToInstance(RazorpayCreateMonthlyPlanData, {
        name: body.name.trim(),
        amountPaise,
        currency,
        existingPlanId: body.providerPlanId?.trim(),
      }),
    );

    const duplicate = await this.plansRepo.findByProviderPlanId(rzpPlan.id);
    if (duplicate) {
      return duplicate;
    }

    return this.plansRepo.insert({
      name: body.name.trim(),
      price: body.price,
      currency,
      interval,
      intervalCount,
      providerPlanId: rzpPlan.id,
      active: body.active ?? true,
    });
  }

  async update(id: string, body: UpdatePlanRequestModel): Promise<Plan> {
    const existing = await this.plansRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Plan not found');
    }

    if (body.price !== undefined && body.price !== Number(existing.price)) {
      throw new BadRequestException(
        'Price changes require a new Razorpay plan. Create a new plan instead.',
      );
    }

    return this.plansRepo.update(id, {
      name: body.name?.trim(),
      currency: body.currency?.trim().toUpperCase(),
      active: body.active,
    });
  }
}
