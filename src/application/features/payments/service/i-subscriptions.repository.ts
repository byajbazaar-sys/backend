import { Subscription } from '../domain';
import { SubscriptionPatch } from '../models';
import { AdminSubscriptionListRow } from './admin-subscription-list-row';
import { AdminSubscriptionListQuery } from './admin-subscription-list-query';

export const SUBSCRIPTIONS_REPOSITORY = 'SUBSCRIPTIONS_REPOSITORY';

export interface ISubscriptionsRepository {
  insert(data: Subscription): Promise<Subscription>;
  update(id: string, data: SubscriptionPatch): Promise<Subscription>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<Subscription>;
  findByProviderSubscriptionId(providerSubscriptionId: string): Promise<Subscription>;
  findLatestByProviderCustomerId(providerCustomerId: string): Promise<Subscription>;
  findLatestByUserId(userId: string): Promise<Subscription>;
  findActiveByUserId(userId: string): Promise<Subscription>;
  /** Statuses: created | authenticated | active | pending | paused */
  findBlockingByUserId(userId: string): Promise<Subscription>;
  findAllAdmin(query: AdminSubscriptionListQuery): Promise<{
    items: AdminSubscriptionListRow[];
    totalCount: number;
  }>;
}
