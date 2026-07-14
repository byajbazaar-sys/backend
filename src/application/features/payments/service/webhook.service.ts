import {
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  ESubscriptionStatus,
  Payment,
  PaymentEvent,
  PaymentOrder,
  Refund,
} from '../domain';
import {
  IPaymentEventsRepository,
  PAYMENT_EVENTS_REPOSITORY,
} from './i-payment-events.repository';
import {
  ISubscriptionsRepository,
  SUBSCRIPTIONS_REPOSITORY,
} from './i-subscriptions.repository';
import { IPaymentsRepository, PAYMENTS_REPOSITORY } from './i-payments.repository';
import {
  IPaymentOrdersRepository,
  PAYMENT_ORDERS_REPOSITORY,
} from './i-payment-orders.repository';
import { IRefundsRepository, REFUNDS_REPOSITORY } from './i-refunds.repository';
import { IRazorpayService, RAZORPAY_SERVICE } from './i-razorpay.service';
import { IWebhookService } from './i-webhook.service';
import { SUBSCRIPTION_PROVIDER_RAZORPAY } from '@shared-libs';
import { IUsersRepository, USERS_REPOSITORY } from '../../users';

@Injectable()
export class WebhookService implements IWebhookService {
  constructor(
    @Inject(RAZORPAY_SERVICE) private readonly razorpay: IRazorpayService,
    @Inject(PAYMENT_EVENTS_REPOSITORY) private readonly eventsRepo: IPaymentEventsRepository,
    @Inject(SUBSCRIPTIONS_REPOSITORY) private readonly subscriptionsRepo: ISubscriptionsRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly paymentsRepo: IPaymentsRepository,
    @Inject(PAYMENT_ORDERS_REPOSITORY) private readonly ordersRepo: IPaymentOrdersRepository,
    @Inject(REFUNDS_REPOSITORY) private readonly refundsRepo: IRefundsRepository,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @InjectPinoLogger(WebhookService.name) private readonly logger: PinoLogger,
  ) {}

  async handleWebhook(
    rawBody: string,
    signature: string | undefined,
  ): Promise<{ received: boolean; duplicate?: boolean }> {
    if (!signature) {
      this.logger.warn('Missing x-razorpay-signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    if (!this.razorpay.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('Invalid Razorpay webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid webhook JSON');
    }

    const eventName = String(payload.event ?? '');
    const eventId = this.extractEventId(payload);
    const eventContext = await this.resolveEventContext(payload);

    const existing = await this.eventsRepo.findByProviderAndEventId(
      SUBSCRIPTION_PROVIDER_RAZORPAY,
      eventId,
    );
    if (existing?.processed) {
      if (this.eventNeedsRelinking(existing)) {
        try {
          await this.linkPaymentEventFromPayload(existing.id!, payload);
        } catch (err) {
          this.logger.error({ err, eventName, eventId }, 'Failed to relink processed webhook event');
        }
      }
      return { received: true, duplicate: true };
    }

    let eventRow: PaymentEvent;
    if (existing) {
      eventRow = existing;
    } else {
      eventRow = await this.eventsRepo.insert({
        provider: SUBSCRIPTION_PROVIDER_RAZORPAY,
        eventId,
        eventName,
        processed: false,
        signature,
        payload,
        userId: eventContext.userId,
      });
    }

    try {
      await this.dispatch(eventName, payload);
      await this.linkPaymentEventFromPayload(eventRow.id!, payload);
      await this.eventsRepo.markProcessed(eventRow.id!);
    } catch (err) {
      this.logger.error({ err, eventName, eventId }, 'Webhook processing failed');
      throw err;
    }

    return { received: true, duplicate: false };
  }

  private eventNeedsRelinking(event: PaymentEvent): boolean {
    return !event.userId && !event.paymentId && !event.paymentOrderId;
  }

  private async resolveOwnerFromRazorpayReferences(
    entity: Record<string, unknown>,
  ): Promise<{ userId: string; subscriptionId: string | null } | null> {
    let providerSubscriptionId: string | null = null;

    if (entity.invoice_id) {
      try {
        const invoice = await this.razorpay.fetchInvoice(String(entity.invoice_id));
        providerSubscriptionId = invoice.subscription_id ?? providerSubscriptionId;
        if (!providerSubscriptionId && invoice.customer_id) {
          const sub = await this.subscriptionsRepo.findLatestByProviderCustomerId(invoice.customer_id);
          if (sub) {
            return { userId: sub.userId, subscriptionId: sub.id ?? null };
          }
        }
      } catch (err) {
        this.logger.warn({ err, invoiceId: entity.invoice_id }, 'Failed to fetch Razorpay invoice for webhook');
      }
    }

    if (!providerSubscriptionId && entity.order_id) {
      try {
        const order = await this.razorpay.fetchOrder(String(entity.order_id));
        providerSubscriptionId = order.subscription_id ?? null;
      } catch (err) {
        this.logger.warn({ err, orderId: entity.order_id }, 'Failed to fetch Razorpay order for webhook');
      }
    }

    if (providerSubscriptionId) {
      const sub = await this.subscriptionsRepo.findByProviderSubscriptionId(providerSubscriptionId);
      if (sub) {
        return { userId: sub.userId, subscriptionId: sub.id ?? null };
      }
    }

    return null;
  }

  private async backfillSiblingPaymentEvents(
    providerPaymentId: string,
    links: {
      userId: string | null;
      paymentId: string | null;
      paymentOrderId: string | null;
    },
  ): Promise<void> {
    if (!links.userId && !links.paymentId && !links.paymentOrderId) {
      return;
    }

    const siblings = await this.eventsRepo.findUnlinkedByProviderPaymentId(providerPaymentId);
    for (const sibling of siblings) {
      await this.eventsRepo.updateLinks(sibling.id!, links);
    }
  }

  private extractEventId(payload: Record<string, unknown>): string {
    if (payload.id) return String(payload.id);
    // Fallback: deterministic hash-like id from event + created_at + entity id
    const createdAt = payload.created_at ?? '';
    const entity = (payload.payload ?? {}) as Record<string, unknown>;
    const firstKey = Object.keys(entity)[0];
    const entityId =
      firstKey && (entity[firstKey] as any)?.entity?.id
        ? String((entity[firstKey] as any).entity.id)
        : 'unknown';
    return `${payload.event}_${createdAt}_${entityId}`;
  }

  private getEntity(payload: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const outer = (payload.payload ?? {}) as Record<string, unknown>;
    const wrapped = outer[key] as { entity?: Record<string, unknown> } | undefined;
    return wrapped?.entity ?? null;
  }

  private readUserIdFromEntityNotes(entity: Record<string, unknown> | null): string | null {
    if (!entity) return null;
    const notes = entity.notes;
    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return null;
    const record = notes as Record<string, string>;
    return record.userId || record.user_id || null;
  }

  private readUserIdFromPayload(payload: Record<string, unknown>): string | null {
    for (const key of ['payment', 'subscription', 'invoice', 'order']) {
      const userId = this.readUserIdFromEntityNotes(this.getEntity(payload, key));
      if (userId) return userId;
    }
    return null;
  }

  private async resolveEventContext(payload: Record<string, unknown>): Promise<{
    userId: string | null;
    providerPaymentId: string | null;
    providerOrderId: string | null;
  }> {
    let userId = this.readUserIdFromPayload(payload);
    let providerPaymentId: string | null = null;
    let providerOrderId: string | null = null;

    const payment = this.getEntity(payload, 'payment');
    if (payment?.id) {
      providerPaymentId = String(payment.id);
      providerOrderId = payment.order_id ? String(payment.order_id) : providerOrderId;
      userId = userId || this.readUserIdFromEntityNotes(payment);
      if (!userId) {
        userId = await this.resolveUserIdFromPaymentEntity(payment);
      }
      if (!userId) {
        const fromRazorpay = await this.resolveOwnerFromRazorpayReferences(payment);
        userId = fromRazorpay?.userId ?? null;
      }
    }

    const invoice = this.getEntity(payload, 'invoice');
    if (invoice?.id) {
      if (invoice.payment_id) {
        providerPaymentId = String(invoice.payment_id);
      }
      providerOrderId = invoice.order_id ? String(invoice.order_id) : providerOrderId;
      userId = userId || this.readUserIdFromEntityNotes(invoice);
    }

    const order = this.getEntity(payload, 'order');
    if (order?.id) {
      providerOrderId = String(order.id);
      userId = userId || this.readUserIdFromEntityNotes(order);
      if (order.subscription_id && !userId) {
        const local = await this.subscriptionsRepo.findByProviderSubscriptionId(
          String(order.subscription_id),
        );
        userId = local?.userId ?? null;
      }
    }

    const subscription = this.getEntity(payload, 'subscription');
    if (subscription?.id) {
      userId = userId || this.readUserIdFromEntityNotes(subscription);
      if (!userId) {
        const local = await this.subscriptionsRepo.findByProviderSubscriptionId(String(subscription.id));
        userId = local?.userId ?? null;
      }
    }

    if (payment?.subscription_id && !userId) {
      const local = await this.subscriptionsRepo.findByProviderSubscriptionId(
        String(payment.subscription_id),
      );
      userId = local?.userId ?? null;
    }

    if (invoice?.subscription_id && !userId) {
      const local = await this.subscriptionsRepo.findByProviderSubscriptionId(
        String(invoice.subscription_id),
      );
      userId = local?.userId ?? null;
    }

    if (order?.subscription_id && !userId) {
      const local = await this.subscriptionsRepo.findByProviderSubscriptionId(
        String(order.subscription_id),
      );
      userId = local?.userId ?? null;
    }

    return { userId, providerPaymentId, providerOrderId };
  }

  private async resolveUserIdFromPaymentEntity(
    entity: Record<string, unknown>,
  ): Promise<string | null> {
    if (entity.customer_id) {
      const sub = await this.subscriptionsRepo.findLatestByProviderCustomerId(
        String(entity.customer_id),
      );
      if (sub?.userId) {
        return sub.userId;
      }
    }

    const email = entity.email ? String(entity.email).trim().toLowerCase() : '';
    if (email) {
      const user = await this.usersRepo.findByEmail(email);
      if (user?.id) {
        return user.id;
      }
    }

    return null;
  }

  private async resolveSubscriptionIdFromPaymentEntity(
    entity: Record<string, unknown>,
    userId: string | null,
  ): Promise<string | null> {
    if (entity.subscription_id) {
      const sub = await this.subscriptionsRepo.findByProviderSubscriptionId(
        String(entity.subscription_id),
      );
      if (sub?.id) {
        return sub.id;
      }
    }

    if (entity.customer_id) {
      const sub = await this.subscriptionsRepo.findLatestByProviderCustomerId(
        String(entity.customer_id),
      );
      if (sub?.id) {
        return sub.id;
      }
    }

    if (userId) {
      const sub = await this.subscriptionsRepo.findLatestByUserId(userId);
      if (sub?.id) {
        return sub.id;
      }
    }

    return null;
  }

  private async ensurePaymentOrderFromPayment(
    entity: Record<string, unknown>,
    userId: string,
    subscriptionId: string | null,
  ): Promise<string | null> {
    if (!entity.order_id) {
      return null;
    }

    const providerOrderId = String(entity.order_id);
    const existing = await this.ordersRepo.findByProviderOrderId(providerOrderId);
    if (existing?.id) {
      return existing.id;
    }

    const notes =
      entity.notes && typeof entity.notes === 'object' && !Array.isArray(entity.notes)
        ? (entity.notes as Record<string, unknown>)
        : null;

    const created = await this.ordersRepo.insert({
      userId,
      subscriptionId,
      providerOrderId,
      receipt: null,
      amount: Number(entity.amount ?? 0) / 100,
      currency: String(entity.currency ?? 'INR'),
      status: String(entity.status ?? 'created'),
      notes,
      rawJson: entity,
    });

    return created.id ?? null;
  }

  private async resolvePaymentOwner(
    entity: Record<string, unknown>,
  ): Promise<{ userId: string; subscriptionId: string | null } | null> {
    const notes = entity.notes;
    const noteRecord =
      notes && typeof notes === 'object' && !Array.isArray(notes)
        ? (notes as Record<string, string>)
        : null;
    let userId = noteRecord?.userId || noteRecord?.user_id || null;
    let subscriptionId = noteRecord?.subscriptionId || noteRecord?.subscription_id || null;

    if (entity.subscription_id) {
      const sub = await this.subscriptionsRepo.findByProviderSubscriptionId(
        String(entity.subscription_id),
      );
      if (sub) {
        subscriptionId = subscriptionId || sub.id!;
        userId = userId || sub.userId;
      }
    }

    if (!userId && entity.customer_id) {
      const sub = await this.subscriptionsRepo.findLatestByProviderCustomerId(
        String(entity.customer_id),
      );
      if (sub) {
        subscriptionId = subscriptionId || sub.id!;
        userId = sub.userId;
      }
    }

    if (!userId) {
      userId = await this.resolveUserIdFromPaymentEntity(entity);
      if (userId && !subscriptionId) {
        subscriptionId = await this.resolveSubscriptionIdFromPaymentEntity(entity, userId);
      }
    }

    if (!userId && entity.order_id) {
      const order = await this.ordersRepo.findByProviderOrderId(String(entity.order_id));
      if (order) {
        userId = order.userId;
        subscriptionId = subscriptionId || order.subscriptionId;
      }
    }

    if (!userId && entity.invoice_id) {
      const byInvoice = await this.paymentsRepo.findByInvoiceId(String(entity.invoice_id));
      if (byInvoice) {
        userId = byInvoice.userId;
        subscriptionId = subscriptionId || byInvoice.subscriptionId;
      }
    }

    if (!userId && entity.order_id) {
      const byOrder = await this.paymentsRepo.findByProviderOrderId(String(entity.order_id));
      if (byOrder) {
        userId = byOrder.userId;
        subscriptionId = subscriptionId || byOrder.subscriptionId;
      }
    }

    if (!userId) {
      const fromRazorpay = await this.resolveOwnerFromRazorpayReferences(entity);
      if (fromRazorpay) {
        userId = fromRazorpay.userId;
        subscriptionId = subscriptionId || fromRazorpay.subscriptionId;
      }
    }

    if (!userId) {
      return null;
    }

    if (!subscriptionId) {
      subscriptionId = await this.resolveSubscriptionIdFromPaymentEntity(entity, userId);
    }

    return { userId, subscriptionId: subscriptionId ?? null };
  }

  private async linkPaymentEventFromPayload(
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const context = await this.resolveEventContext(payload);
    let userId = context.userId;
    let paymentId: string | null = null;
    let paymentOrderId: string | null = null;

    const paymentEntity = this.getEntity(payload, 'payment');
    if (paymentEntity?.id) {
      const owner = await this.resolvePaymentOwner(paymentEntity);
      if (owner) {
        const saved = await this.upsertPaymentFromEntity(
          paymentEntity,
          owner.userId,
          owner.subscriptionId,
        );
        paymentId = saved.id ?? null;
        userId = userId || saved.userId;
        paymentOrderId =
          (await this.ensurePaymentOrderFromPayment(
            paymentEntity,
            owner.userId,
            owner.subscriptionId,
          )) ?? paymentOrderId;
      } else {
        const existing = await this.paymentsRepo.findByProviderPaymentId(String(paymentEntity.id));
        if (existing?.id) {
          paymentId = existing.id;
          userId = userId || existing.userId;
        }
      }
    }

    if (!paymentId && context.providerPaymentId) {
      const payment = await this.paymentsRepo.findByProviderPaymentId(context.providerPaymentId);
      if (payment?.id) {
        paymentId = payment.id;
        userId = userId || payment.userId;
      }
    }

    const invoice = this.getEntity(payload, 'invoice');
    if (!paymentId && invoice?.payment_id) {
      const payment = await this.paymentsRepo.findByProviderPaymentId(String(invoice.payment_id));
      if (payment?.id) {
        paymentId = payment.id;
        userId = userId || payment.userId;
      }
    }

    if (context.providerOrderId) {
      const order = await this.ordersRepo.findByProviderOrderId(context.providerOrderId);
      if (order?.id) {
        paymentOrderId = order.id;
        userId = userId || order.userId;
      }
    }

    const subscription = this.getEntity(payload, 'subscription');
    const providerSubscriptionId = subscription?.id
      ? String(subscription.id)
      : paymentEntity?.subscription_id
        ? String(paymentEntity.subscription_id)
        : invoice?.subscription_id
          ? String(invoice.subscription_id)
          : null;

    if (providerSubscriptionId) {
      const local = await this.subscriptionsRepo.findByProviderSubscriptionId(providerSubscriptionId);
      if (local) {
        userId = userId || local.userId;
        if (!paymentId && local.id) {
          const payments = await this.paymentsRepo.findBySubscriptionId(local.id);
          paymentId = payments[0]?.id ?? null;
        }
        if (!paymentOrderId && local.id) {
          const orders = await this.ordersRepo.findBySubscriptionId(local.id);
          paymentOrderId = orders[0]?.id ?? null;
        }
      }
    }

    if (userId || paymentId || paymentOrderId) {
      const links = { userId, paymentId, paymentOrderId };
      await this.eventsRepo.updateLinks(eventId, links);

      const providerPaymentId =
        context.providerPaymentId ??
        (paymentEntity?.id ? String(paymentEntity.id) : null);
      if (providerPaymentId) {
        await this.backfillSiblingPaymentEvents(providerPaymentId, links);
      }
    }
  }

  private async dispatch(eventName: string, payload: Record<string, unknown>): Promise<void> {
    switch (eventName) {
      case 'subscription.authenticated':
      case 'subscription.activated':
      case 'subscription.charged':
      case 'subscription.pending':
      case 'subscription.halted':
      case 'subscription.cancelled':
      case 'subscription.completed':
        await this.handleSubscriptionEvent(eventName, payload);
        break;
      case 'payment.authorized':
      case 'payment.captured':
      case 'payment.failed':
        await this.handlePaymentEvent(eventName, payload);
        break;
      case 'refund.created':
      case 'refund.processed':
        await this.handleRefundEvent(payload);
        break;
      case 'invoice.paid':
      case 'invoice.partially_paid':
      case 'invoice.expired':
        await this.handleInvoiceEvent(eventName, payload);
        break;
      case 'order.paid':
        await this.handleOrderEvent(payload);
        break;
      default:
        this.logger.info({ eventName }, 'Unhandled Razorpay webhook event stored only');
    }
  }

  private mapSubscriptionStatus(eventName: string, rzpStatus?: string): ESubscriptionStatus {
    if (rzpStatus) {
      const mapped = Object.values(ESubscriptionStatus).find((s) => s === rzpStatus);
      if (mapped) return mapped;
    }
    switch (eventName) {
      case 'subscription.authenticated':
        return ESubscriptionStatus.Authenticated;
      case 'subscription.activated':
      case 'subscription.charged':
        return ESubscriptionStatus.Active;
      case 'subscription.pending':
        return ESubscriptionStatus.Pending;
      case 'subscription.halted':
        return ESubscriptionStatus.Halted;
      case 'subscription.cancelled':
        return ESubscriptionStatus.Cancelled;
      case 'subscription.completed':
        return ESubscriptionStatus.Completed;
      default:
        return ESubscriptionStatus.Pending;
    }
  }

  private async handleSubscriptionEvent(
    eventName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const entity = this.getEntity(payload, 'subscription');
    if (!entity?.id) {
      this.logger.warn({ eventName }, 'Subscription entity missing in webhook');
      return;
    }

    const providerSubscriptionId = String(entity.id);
    const local = await this.subscriptionsRepo.findByProviderSubscriptionId(providerSubscriptionId);
    if (!local) {
      this.logger.warn({ providerSubscriptionId, eventName }, 'No local subscription for webhook');
      return;
    }

    const status = this.mapSubscriptionStatus(eventName, entity.status ? String(entity.status) : undefined);
    const patch: Partial<typeof local> = {
      status,
      providerCustomerId: entity.customer_id ? String(entity.customer_id) : local.providerCustomerId,
    };

    if (typeof entity.current_start === 'number') {
      patch.currentStart = new Date(Number(entity.current_start) * 1000);
    }
    if (typeof entity.current_end === 'number') {
      patch.currentEnd = new Date(Number(entity.current_end) * 1000);
    }
    if (typeof entity.charge_at === 'number') {
      patch.nextBillingAt = new Date(Number(entity.charge_at) * 1000);
    }
    if (status === ESubscriptionStatus.Cancelled) {
      patch.cancelledAt = new Date();
    }

    await this.subscriptionsRepo.update(local.id!, patch);

    // subscription.charged often includes payment — persist if present
    const paymentEntity = this.getEntity(payload, 'payment');
    if (paymentEntity?.id) {
      const saved = await this.upsertPaymentFromEntity(paymentEntity, local.userId, local.id!);
      const paymentOrderId = await this.ensurePaymentOrderFromPayment(
        paymentEntity,
        local.userId,
        local.id!,
      );
      await this.backfillSiblingPaymentEvents(String(paymentEntity.id), {
        userId: local.userId,
        paymentId: saved.id ?? null,
        paymentOrderId,
      });
    }
  }

  private async handlePaymentEvent(
    eventName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const entity = this.getEntity(payload, 'payment');
    if (!entity?.id) return;

    const owner = await this.resolvePaymentOwner(entity);
    if (!owner) {
      this.logger.warn({ paymentId: entity.id, eventName }, 'Cannot resolve user for payment webhook');
      return;
    }

    await this.upsertPaymentFromEntity(entity, owner.userId, owner.subscriptionId);
    await this.ensurePaymentOrderFromPayment(entity, owner.userId, owner.subscriptionId);

    if (eventName === 'payment.failed' && owner.subscriptionId) {
      const sub = await this.subscriptionsRepo.findById(owner.subscriptionId);
      if (
        sub &&
        (sub.status === ESubscriptionStatus.Created ||
          sub.status === ESubscriptionStatus.Pending ||
          sub.status === ESubscriptionStatus.Authenticated)
      ) {
        await this.subscriptionsRepo.delete(owner.subscriptionId);
      } else if (sub) {
        await this.subscriptionsRepo.update(owner.subscriptionId, { status: ESubscriptionStatus.Pending });
      }
    }
  }

  private async upsertPaymentFromEntity(
    entity: Record<string, unknown>,
    userId: string,
    subscriptionId: string | null,
  ): Promise<Payment> {
    const amountPaise = Number(entity.amount ?? 0);
    const payment: Payment = {
      userId,
      subscriptionId,
      providerPaymentId: String(entity.id),
      providerOrderId: entity.order_id ? String(entity.order_id) : null,
      amount: amountPaise / 100,
      currency: String(entity.currency ?? 'INR'),
      status: String(entity.status ?? ''),
      method: entity.method ? String(entity.method) : null,
      bank: entity.bank ? String(entity.bank) : null,
      wallet: entity.wallet ? String(entity.wallet) : null,
      upi: entity.vpa ? String(entity.vpa) : null,
      fee: entity.fee != null ? Number(entity.fee) / 100 : null,
      tax: entity.tax != null ? Number(entity.tax) / 100 : null,
      capturedAt:
        entity.status === 'captured' || entity.captured
          ? new Date()
          : null,
      invoiceId: entity.invoice_id ? String(entity.invoice_id) : null,
      rawJson: entity,
    };
    return this.paymentsRepo.upsertByProviderPaymentId(payment);
  }

  private async handleRefundEvent(payload: Record<string, unknown>): Promise<void> {
    const entity = this.getEntity(payload, 'refund');
    if (!entity?.id) return;

    const providerPaymentId = entity.payment_id ? String(entity.payment_id) : null;
    if (!providerPaymentId) return;

    const payment = await this.paymentsRepo.findByProviderPaymentId(providerPaymentId);
    if (!payment) {
      this.logger.warn({ providerPaymentId }, 'Refund webhook for unknown payment');
      return;
    }

    const refund: Refund = {
      paymentId: payment.id!,
      providerRefundId: String(entity.id),
      amount: Number(entity.amount ?? 0) / 100,
      status: String(entity.status ?? ''),
      reason: entity.notes ? JSON.stringify(entity.notes) : null,
      rawJson: entity,
    };
    await this.refundsRepo.upsertByProviderRefundId(refund);
  }

  private async handleInvoiceEvent(
    eventName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const entity = this.getEntity(payload, 'invoice');
    if (!entity?.id) return;

    let userId: string | undefined;
    let subscriptionId: string | null = null;

    if (entity.subscription_id) {
      const sub = await this.subscriptionsRepo.findByProviderSubscriptionId(
        String(entity.subscription_id),
      );
      if (sub) {
        userId = sub.userId;
        subscriptionId = sub.id!;
      }
    }

    const notes = (entity.notes ?? {}) as Record<string, string>;
    userId = userId || notes.userId || notes.user_id;

    if (!userId) {
      this.logger.warn({ invoiceId: entity.id, eventName }, 'Cannot resolve user for invoice webhook');
      return;
    }

    const order: PaymentOrder = {
      userId,
      subscriptionId,
      providerOrderId: entity.order_id ? String(entity.order_id) : String(entity.id),
      receipt: entity.receipt ? String(entity.receipt) : null,
      amount: Number(entity.amount ?? 0) / 100,
      currency: String(entity.currency ?? 'INR'),
      status: String(entity.status ?? eventName),
      notes: notes,
      rawJson: entity,
    };

    const existing = order.providerOrderId
      ? await this.ordersRepo.findByProviderOrderId(order.providerOrderId)
      : null;
    if (existing) {
      // Keep complete latest payload — insert is idempotent via unique index; skip duplicate
      return;
    }
    await this.ordersRepo.insert(order);

    const paymentEntity = this.getEntity(payload, 'payment');
    if (paymentEntity?.id) {
      await this.upsertPaymentFromEntity(paymentEntity, userId, subscriptionId);
    } else if (entity.payment_id) {
      const payment = await this.paymentsRepo.findByProviderPaymentId(String(entity.payment_id));
      if (payment?.id && subscriptionId && !payment.subscriptionId) {
        await this.paymentsRepo.upsertByProviderPaymentId({
          ...payment,
          subscriptionId,
        });
      }
    }

    if (eventName === 'invoice.paid' && subscriptionId) {
      await this.subscriptionsRepo.update(subscriptionId, { status: ESubscriptionStatus.Active });
    }
  }

  private async handleOrderEvent(payload: Record<string, unknown>): Promise<void> {
    const entity = this.getEntity(payload, 'order');
    if (!entity?.id) return;

    let userId: string | null = this.readUserIdFromEntityNotes(entity);
    let subscriptionId: string | null = null;

    if (entity.subscription_id) {
      const sub = await this.subscriptionsRepo.findByProviderSubscriptionId(
        String(entity.subscription_id),
      );
      if (sub) {
        userId = userId || sub.userId;
        subscriptionId = sub.id!;
      }
    }

    if (!userId) {
      this.logger.warn({ orderId: entity.id }, 'Cannot resolve user for order webhook');
      return;
    }

    const notes = (entity.notes ?? {}) as Record<string, string>;
    const order: PaymentOrder = {
      userId,
      subscriptionId,
      providerOrderId: String(entity.id),
      receipt: entity.receipt ? String(entity.receipt) : null,
      amount: Number(entity.amount ?? 0) / 100,
      currency: String(entity.currency ?? 'INR'),
      status: String(entity.status ?? 'paid'),
      notes,
      rawJson: entity,
    };

    const existing = await this.ordersRepo.findByProviderOrderId(String(entity.id));
    if (!existing) {
      await this.ordersRepo.insert(order);
    }

    const paymentEntity = this.getEntity(payload, 'payment');
    if (paymentEntity?.id) {
      await this.upsertPaymentFromEntity(paymentEntity, userId, subscriptionId);
    }
  }
}
