import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EUserType, Roles, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import {
  AdminSubscriptionDetailResponseModel,
  AdminSubscriptionsPagedResponseModel,
  CreatePlanRequestModel,
  CreateRefundRequestModel,
  ExtendTrialRequestModel,
  ListAdminSubscriptionsQueryModel,
  PlanResponseModel,
  RefundResponseModel,
  UpdatePlanRequestModel,
} from './models';
import {
  ISubscriptionAdminService,
  SUBSCRIPTION_ADMIN_SERVICE,
} from './service/i-subscription-admin.service';
import { IPlanService, PLAN_SERVICE } from './service/i-plan.service';

@ApiTags('payments')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Roles(EUserType.Admin)
@Controller('payments')
export class AdminPaymentsController {
  constructor(
    @Inject(SUBSCRIPTION_ADMIN_SERVICE)
    private readonly subscriptionAdminService: ISubscriptionAdminService,
    @Inject(PLAN_SERVICE) private readonly planService: IPlanService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'List subscription plans (admin)' })
  @ApiOkResponse({ type: [PlanResponseModel] })
  async listPlans(): Promise<PlanResponseModel[]> {
    const plans = await this.planService.list();
    return plainToInstance(PlanResponseModel, plans, { excludeExtraneousValues: true });
  }

  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create subscription plan (admin)' })
  @ApiOkResponse({ type: PlanResponseModel })
  async createPlan(@Body() body: CreatePlanRequestModel): Promise<PlanResponseModel> {
    const plan = await this.planService.create(body);
    return plainToInstance(PlanResponseModel, plan, { excludeExtraneousValues: true });
  }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Update subscription plan (admin)' })
  @ApiOkResponse({ type: PlanResponseModel })
  async updatePlan(
    @Param('id') id: string,
    @Body() body: UpdatePlanRequestModel,
  ): Promise<PlanResponseModel> {
    const plan = await this.planService.update(id, body);
    return plainToInstance(PlanResponseModel, plan, { excludeExtraneousValues: true });
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'List subscriptions (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionsPagedResponseModel })
  async listSubscriptions(
    @Query() query: ListAdminSubscriptionsQueryModel,
  ): Promise<AdminSubscriptionsPagedResponseModel> {
    return this.subscriptionAdminService.list(query);
  }

  @Post('subscriptions/refunds/:paymentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund payment (admin)' })
  @ApiOkResponse({ type: RefundResponseModel })
  async refundPayment(
    @Param('paymentId') paymentId: string,
    @Body() body: CreateRefundRequestModel,
  ): Promise<RefundResponseModel> {
    return this.subscriptionAdminService.refundPayment(paymentId, body);
  }

  @Post('subscriptions/:id/extend-trial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extend user trial period (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionDetailResponseModel })
  async extendTrial(
    @Param('id') id: string,
    @Body() body: ExtendTrialRequestModel,
  ): Promise<AdminSubscriptionDetailResponseModel> {
    return this.subscriptionAdminService.extendTrial(id, body);
  }

  @Get('subscriptions/:id')
  @ApiOperation({ summary: 'Get subscription details (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionDetailResponseModel })
  async getSubscription(@Param('id') id: string): Promise<AdminSubscriptionDetailResponseModel> {
    return this.subscriptionAdminService.getById(id);
  }

  @Post('subscriptions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionDetailResponseModel })
  async cancelSubscription(@Param('id') id: string): Promise<AdminSubscriptionDetailResponseModel> {
    return this.subscriptionAdminService.cancel(id);
  }

  @Post('subscriptions/:id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume subscription (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionDetailResponseModel })
  async resumeSubscription(@Param('id') id: string): Promise<AdminSubscriptionDetailResponseModel> {
    return this.subscriptionAdminService.resume(id);
  }

  @Post('subscriptions/:id/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync subscription status from Razorpay (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionDetailResponseModel })
  async syncSubscription(@Param('id') id: string): Promise<AdminSubscriptionDetailResponseModel> {
    return this.subscriptionAdminService.sync(id);
  }
}
