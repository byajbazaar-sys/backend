import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Request } from 'express';
import {
  ApplyCouponRequestModel,
  ApplyCouponResponseModel,
  CancelSubscriptionRequestModel,
  CreateSubscriptionRequestModel,
  CreateSubscriptionResponseModel,
  InvoiceResponseModel,
  PaymentResponseModel,
  SubscriptionStatusResponseModel,
} from './models';
import { IPaymentsService, PAYMENTS_SERVICE } from './service/i-payments.service';
import { IWebhookService, WEBHOOK_SERVICE } from './service/i-webhook.service';
import { USERS_REPOSITORY, IUsersRepository } from '../users';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    @Inject(PAYMENTS_SERVICE) private readonly paymentsService: IPaymentsService,
    @Inject(WEBHOOK_SERVICE) private readonly webhookService: IWebhookService,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @InjectPinoLogger(PaymentsController.name) private readonly logger: PinoLogger,
  ) {}

  @Post('subscription/create')
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create Razorpay monthly subscription' })
  @ApiOkResponse({ type: CreateSubscriptionResponseModel })
  async createSubscription(
    @Body() body: CreateSubscriptionRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<CreateSubscriptionResponseModel> {
    const user = await this.usersRepo.findById(identity.userId);
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || '';
    return this.paymentsService.createSubscription(identity.userId, body, {
      email: user?.email || identity.email || '',
      name,
      phone: user?.phoneNumber,
    });
  }

  @Get('subscription/status')
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get current subscription status' })
  @ApiOkResponse({ type: SubscriptionStatusResponseModel })
  async getStatus(@Identity() identity: IIdentity): Promise<SubscriptionStatusResponseModel> {
    return this.paymentsService.getStatus(identity.userId);
  }

  @Post('subscription/cancel')
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiOkResponse({ type: SubscriptionStatusResponseModel })
  async cancel(
    @Body() body: CancelSubscriptionRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<SubscriptionStatusResponseModel> {
    return this.paymentsService.cancel(identity.userId, body);
  }

  @Post('subscription/resume')
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Resume paused / cancel-at-period-end subscription' })
  @ApiOkResponse({ type: SubscriptionStatusResponseModel })
  async resume(@Identity() identity: IIdentity): Promise<SubscriptionStatusResponseModel> {
    return this.paymentsService.resume(identity.userId);
  }

  @Post('subscription/apply-coupon')
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Preview / validate a coupon for subscription' })
  @ApiOkResponse({ type: ApplyCouponResponseModel })
  async applyCoupon(
    @Body() body: ApplyCouponRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<ApplyCouponResponseModel> {
    return this.paymentsService.applyCoupon(identity.userId, body);
  }

  @Post('webhook')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Razorpay webhook receiver (signature verified)' })
  @ApiHeader({ name: 'x-razorpay-signature', required: true })
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string,
  ): Promise<{ received: boolean; duplicate?: boolean }> {
    const rawBody =
      req.rawBody?.toString('utf8') ||
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

    try {
      return await this.webhookService.handleWebhook(rawBody, signature);
    } catch (err) {
      this.logger.error({ err }, 'Webhook endpoint failure');
      throw err;
    }
  }

  @Get()
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'List payments for current user' })
  @ApiOkResponse({ type: [PaymentResponseModel] })
  async listPayments(
    @Identity() identity: IIdentity,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<PaymentResponseModel[]> {
    return this.paymentsService.listPayments(identity.userId, page, pageSize);
  }

  @Get('history')
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Payment history for current user' })
  @ApiOkResponse({ type: [PaymentResponseModel] })
  async history(
    @Identity() identity: IIdentity,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<PaymentResponseModel[]> {
    return this.paymentsService.paymentHistory(identity.userId, page, pageSize);
  }

  @Get('invoices')
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Invoices for current user' })
  @ApiOkResponse({ type: [InvoiceResponseModel] })
  async invoices(@Identity() identity: IIdentity): Promise<InvoiceResponseModel[]> {
    return this.paymentsService.listInvoices(identity.userId);
  }
}
