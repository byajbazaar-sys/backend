import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { RazorpayOptions } from '../../../shared';
import {
  IRazorpayService,
} from './i-razorpay.service';
import { RazorpayCustomerResult } from './razorpay-customer-result';
import { RazorpayInvoiceResult } from './razorpay-invoice-result';
import { RazorpayOrderResult } from './razorpay-order-result';
import { RazorpayPlanResult } from './razorpay-plan-result';
import { RazorpayRefundResult } from './razorpay-refund-result';
import { RazorpaySubscriptionResult } from './razorpay-subscription-result';
import {
  RazorpayCreateMonthlyPlanData,
  RazorpayCreateCustomerData,
  RazorpayCreateSubscriptionData,
  RazorpayCreateRefundData,
} from '../domain';

@Injectable()
export class RazorpayService implements IRazorpayService, OnModuleInit {
  private client: Razorpay = null;

  constructor(
    private readonly options: RazorpayOptions,
    @InjectPinoLogger(RazorpayService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    if (!this.options.keyId || !this.options.keySecret) {
      this.logger.warn('Razorpay credentials not configured — payment APIs will fail until set');
      return;
    }
    this.client = new Razorpay({
      key_id: this.options.keyId,
      key_secret: this.options.keySecret,
    });
  }

  getKeyId(): string {
    return this.options.keyId;
  }

  private getClient(): Razorpay {
    if (!this.client) {
      throw new InternalServerErrorException('Razorpay is not configured');
    }
    return this.client;
  }

  private toSubscriptionResult(raw: Record<string, unknown>): RazorpaySubscriptionResult {
    return {
      id: String(raw.id),
      status: String(raw.status ?? ''),
      plan_id: String(raw.plan_id ?? ''),
      customer_id: raw.customer_id ? String(raw.customer_id) : undefined,
      short_url: raw.short_url ? String(raw.short_url) : undefined,
      current_start: typeof raw.current_start === 'number' ? raw.current_start : undefined,
      current_end: typeof raw.current_end === 'number' ? raw.current_end : undefined,
      charge_at: typeof raw.charge_at === 'number' ? raw.charge_at : undefined,
      raw,
    };
  }

  /**
   * Find or create a Razorpay plan for a specific amount (e.g. coupon-discounted checkout).
   */
  async ensureMonthlyPlan(amountPaise: number, currency = 'INR'): Promise<RazorpayPlanResult> {
    const client = this.getClient();

    try {
      const listed = (await client.plans.all({ count: 100 })) as unknown as {
        items?: Record<string, unknown>[];
      };
      const match = (listed.items ?? []).find((p) => {
        const item = (p.item ?? {}) as Record<string, unknown>;
        return (
          Number(item.amount) === amountPaise &&
          String(item.currency ?? 'INR') === currency &&
          String(p.period) === 'monthly' &&
          Number(p.interval) === 1
        );
      });
      if (match) {
        const item = (match.item ?? {}) as Record<string, unknown>;
        return {
          id: String(match.id),
          amount: Number(item.amount),
          currency: String(item.currency ?? currency),
          period: String(match.period),
          interval: Number(match.interval),
          raw: match,
        };
      }
    } catch (err) {
      this.logger.warn({ err }, 'Razorpay plans.list failed');
    }

    const created = (await client.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: `ByajBazaar Monthly (${amountPaise / 100} ${currency})`,
        amount: amountPaise,
        currency,
        description: 'ByajBazaar SaaS monthly subscription',
      },
      notes: {
        app: 'byajbazaar',
        amount_paise: String(amountPaise),
      },
    })) as unknown as Record<string, unknown>;

    const item = (created.item ?? {}) as Record<string, unknown>;
    return {
      id: String(created.id),
      amount: Number(item.amount ?? amountPaise),
      currency: String(item.currency ?? currency),
      period: String(created.period ?? 'monthly'),
      interval: Number(created.interval ?? 1),
      raw: created,
    };
  }

  async createMonthlyPlan(params: RazorpayCreateMonthlyPlanData): Promise<RazorpayPlanResult> {
    const currency = params.currency ?? 'INR';
    const client = this.getClient();

    if (params.existingPlanId?.trim()) {
      const existing = (await client.plans.fetch(params.existingPlanId.trim())) as unknown as Record<
        string,
        unknown
      >;
      const item = (existing.item ?? {}) as Record<string, unknown>;
      return {
        id: String(existing.id),
        amount: Number(item.amount ?? params.amountPaise),
        currency: String(item.currency ?? currency),
        period: String(existing.period ?? 'monthly'),
        interval: Number(existing.interval ?? 1),
        raw: existing,
      };
    }

    try {
      const listed = (await client.plans.all({ count: 100 })) as unknown as {
        items?: Record<string, unknown>[];
      };
      const match = (listed.items ?? []).find((p) => {
        const item = (p.item ?? {}) as Record<string, unknown>;
        return (
          Number(item.amount) === params.amountPaise &&
          String(item.currency ?? 'INR') === currency &&
          String(p.period) === 'monthly' &&
          Number(p.interval) === 1 &&
          String(item.name ?? '') === params.name
        );
      });
      if (match) {
        const item = (match.item ?? {}) as Record<string, unknown>;
        return {
          id: String(match.id),
          amount: Number(item.amount),
          currency: String(item.currency ?? currency),
          period: String(match.period),
          interval: Number(match.interval),
          raw: match,
        };
      }
    } catch (err) {
      this.logger.warn({ err }, 'Razorpay plans.list failed during admin plan create');
    }

    const created = (await client.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: params.name,
        amount: params.amountPaise,
        currency,
        description: `${params.name} monthly subscription`,
      },
      notes: {
        app: 'byajbazaar',
        amount_paise: String(params.amountPaise),
      },
    })) as unknown as Record<string, unknown>;

    const item = (created.item ?? {}) as Record<string, unknown>;
    return {
      id: String(created.id),
      amount: Number(item.amount ?? params.amountPaise),
      currency: String(item.currency ?? currency),
      period: String(created.period ?? 'monthly'),
      interval: Number(created.interval ?? 1),
      raw: created,
    };
  }

  async createOrGetCustomer(params: RazorpayCreateCustomerData): Promise<RazorpayCustomerResult> {
    const client = this.getClient();
    const payload: Record<string, unknown> = {
      name: params.name,
      email: params.email,
      notes: { app: 'byajbazaar' },
      // Razorpay expects string '0'|'1'; numeric 0 is treated as omitted and defaults to fail.
      fail_existing: '0',
    };
    if (params.contact?.trim()) {
      payload.contact = params.contact.trim();
    }

    try {
      const created = (await client.customers.create(payload)) as unknown as Record<string, unknown>;
      return { id: String(created.id), raw: created };
    } catch (err: any) {
      const existingId = err?.error?.metadata?.customer_id || err?.error?.customer_id;
      if (existingId) {
        const fetched = (await client.customers.fetch(String(existingId))) as unknown as Record<string, unknown>;
        return { id: String(fetched.id), raw: fetched };
      }

      const existing = await this.findCustomerByEmail(params.email);
      if (existing) {
        return existing;
      }

      this.logger.error({ err }, 'Razorpay customer create failed');
      throw new BadRequestException(err?.error?.description || 'Failed to create Razorpay customer');
    }
  }

  private async findCustomerByEmail(email: string): Promise<RazorpayCustomerResult> {
    const client = this.getClient();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    try {
      const listed = (await client.customers.all({
        email: normalized,
        count: 100,
      } as Record<string, unknown>)) as unknown as {
        items?: Record<string, unknown>[];
      };
      const match = (listed.items ?? []).find(
        (item) => String(item.email ?? '').toLowerCase() === normalized,
      );
      if (!match) {
        return null;
      }
      return { id: String(match.id), raw: match };
    } catch (err) {
      this.logger.warn({ err, email: normalized }, 'Razorpay customers.all failed');
      return null;
    }
  }

  async createSubscription(params: RazorpayCreateSubscriptionData): Promise<RazorpaySubscriptionResult> {
    const client = this.getClient();
    try {
      const payload: Record<string, unknown> = {
        plan_id: params.planId,
        total_count: params.totalCount ?? 120, // 10 years of monthly cycles
        customer_notify: true,
        notes: params.notes ?? {},
      };
      const notifyInfo: Record<string, string> = {};
      if (params.notifyInfo?.email?.trim()) {
        notifyInfo.notify_email = params.notifyInfo.email.trim();
      }
      if (params.notifyInfo?.phone?.trim()) {
        notifyInfo.notify_phone = params.notifyInfo.phone.trim();
      }
      if (Object.keys(notifyInfo).length > 0) {
        payload.notify_info = notifyInfo;
      }
      const created = (await client.subscriptions.create(payload as any)) as unknown as Record<string, unknown>;
      return this.toSubscriptionResult(created);
    } catch (err: any) {
      this.logger.error({ err }, 'Razorpay subscription create failed');
      throw new BadRequestException(err?.error?.description || 'Failed to create Razorpay subscription');
    }
  }

  async cancelSubscription(
    providerSubscriptionId: string,
    cancelAtCycleEnd: boolean,
  ): Promise<RazorpaySubscriptionResult> {
    const client = this.getClient();
    const raw = (await client.subscriptions.cancel(
      providerSubscriptionId,
      cancelAtCycleEnd,
    )) as unknown as Record<string, unknown>;
    return this.toSubscriptionResult(raw);
  }

  async resumeSubscription(providerSubscriptionId: string): Promise<RazorpaySubscriptionResult> {
    const client = this.getClient();
    const raw = (await (client.subscriptions as any).resume(providerSubscriptionId, {
      resume_at: 'now',
    })) as unknown as Record<string, unknown>;
    return this.toSubscriptionResult(raw);
  }

  async pauseSubscription(providerSubscriptionId: string): Promise<RazorpaySubscriptionResult> {
    const client = this.getClient();
    const raw = (await (client.subscriptions as any).pause(providerSubscriptionId, {
      pause_at: 'now',
    })) as unknown as Record<string, unknown>;
    return this.toSubscriptionResult(raw);
  }

  async fetchSubscription(providerSubscriptionId: string): Promise<RazorpaySubscriptionResult> {
    const client = this.getClient();
    const raw = (await client.subscriptions.fetch(providerSubscriptionId)) as unknown as Record<
      string,
      unknown
    >;
    return this.toSubscriptionResult(raw);
  }

  async fetchInvoice(invoiceId: string): Promise<RazorpayInvoiceResult> {
    const client = this.getClient();
    const raw = (await client.invoices.fetch(invoiceId)) as unknown as Record<string, unknown>;
    return {
      id: String(raw.id),
      subscription_id: raw.subscription_id ? String(raw.subscription_id) : undefined,
      order_id: raw.order_id ? String(raw.order_id) : undefined,
      customer_id: raw.customer_id ? String(raw.customer_id) : undefined,
      payment_id: raw.payment_id ? String(raw.payment_id) : undefined,
      raw,
    };
  }

  async fetchOrder(orderId: string): Promise<RazorpayOrderResult> {
    const client = this.getClient();
    const raw = (await client.orders.fetch(orderId)) as unknown as Record<string, unknown>;
    return {
      id: String(raw.id),
      subscription_id: raw.subscription_id ? String(raw.subscription_id) : undefined,
      raw,
    };
  }

  async createRefund(params: RazorpayCreateRefundData): Promise<RazorpayRefundResult> {
    const client = this.getClient();
    try {
      const payload: Record<string, unknown> = {
        notes: params.notes ?? {},
      };
      if (params.amountPaise != null) {
        payload.amount = params.amountPaise;
      }
      const raw = (await client.payments.refund(params.providerPaymentId, payload)) as unknown as Record<
        string,
        unknown
      >;
      return {
        id: String(raw.id),
        payment_id: String(raw.payment_id ?? params.providerPaymentId),
        amount: Number(raw.amount ?? params.amountPaise ?? 0),
        currency: String(raw.currency ?? 'INR'),
        status: String(raw.status ?? 'pending'),
        raw,
      };
    } catch (err: any) {
      this.logger.error({ err, paymentId: params.providerPaymentId }, 'Razorpay refund failed');
      throw new BadRequestException(err?.error?.description || 'Failed to create Razorpay refund');
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.options.webhookSecret) {
      this.logger.error('RAZORPAY_WEBHOOK_SECRET is not configured');
      return false;
    }
    if (!signature || !rawBody) {
      return false;
    }
    try {
      const expected = crypto
        .createHmac('sha256', this.options.webhookSecret)
        .update(rawBody)
        .digest('hex');
      const expectedBuf = Buffer.from(expected, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');
      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }
      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch (err) {
      this.logger.error({ err }, 'Webhook signature verification failed');
      return false;
    }
  }
}
