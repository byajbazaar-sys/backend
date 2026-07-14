import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Body,
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
import {
  AdminSubscriptionDetailResponseModel,
  AdminSubscriptionsPagedResponseModel,
  CreateRefundRequestModel,
  ExtendTrialRequestModel,
  ListAdminSubscriptionsQueryModel,
  RefundResponseModel,
} from './models';
import {
  ISubscriptionAdminService,
  SUBSCRIPTION_ADMIN_SERVICE,
} from './service/i-subscription-admin.service';

@ApiTags('payments')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Roles(EUserType.Admin)
@Controller('payments/subscriptions')
export class AdminSubscriptionsController {
  constructor(
    @Inject(SUBSCRIPTION_ADMIN_SERVICE)
    private readonly subscriptionAdminService: ISubscriptionAdminService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List subscriptions (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionsPagedResponseModel })
  async list(
    @Query() query: ListAdminSubscriptionsQueryModel,
  ): Promise<AdminSubscriptionsPagedResponseModel> {
    return this.subscriptionAdminService.list(query);
  }

  @Post('refunds/:paymentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund payment (admin)' })
  @ApiOkResponse({ type: RefundResponseModel })
  async refundPayment(
    @Param('paymentId') paymentId: string,
    @Body() body: CreateRefundRequestModel,
  ): Promise<RefundResponseModel> {
    return this.subscriptionAdminService.refundPayment(paymentId, body);
  }

  @Post(':id/extend-trial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extend user trial period (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionDetailResponseModel })
  async extendTrial(
    @Param('id') id: string,
    @Body() body: ExtendTrialRequestModel,
  ): Promise<AdminSubscriptionDetailResponseModel> {
    return this.subscriptionAdminService.extendTrial(id, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get subscription details (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionDetailResponseModel })
  async getById(@Param('id') id: string): Promise<AdminSubscriptionDetailResponseModel> {
    return this.subscriptionAdminService.getById(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionDetailResponseModel })
  async cancel(@Param('id') id: string): Promise<AdminSubscriptionDetailResponseModel> {
    return this.subscriptionAdminService.cancel(id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume subscription (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionDetailResponseModel })
  async resume(@Param('id') id: string): Promise<AdminSubscriptionDetailResponseModel> {
    return this.subscriptionAdminService.resume(id);
  }

  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync subscription status from Razorpay (admin)' })
  @ApiOkResponse({ type: AdminSubscriptionDetailResponseModel })
  async sync(@Param('id') id: string): Promise<AdminSubscriptionDetailResponseModel> {
    return this.subscriptionAdminService.sync(id);
  }
}
