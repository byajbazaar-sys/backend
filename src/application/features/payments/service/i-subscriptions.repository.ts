import { Subscription } from '../domain';

export const SUBSCRIPTIONS_REPOSITORY = 'SUBSCRIPTIONS_REPOSITORY';

export type AdminSubscriptionStatusFilter = 'active' | 'cancelled' | 'pending' | 'halted';

export interface AdminSubscriptionListRow {
  subscription: Subscription;
  userEmail: string;
  userFirstName: string | null;
  userLastName: string | null;
  planName: string | null;
}

export interface AdminSubscriptionListQuery {
  page: number;
  pageSize: number;
  status?: AdminSubscriptionStatusFilter;
  search?: string;
}

export interface ISubscriptionsRepository {
  insert(data: Subscription): Promise<Subscription>;
  update(id: string, data: Partial<Subscription>): Promise<Subscription>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<Subscription | null>;
  findByProviderSubscriptionId(providerSubscriptionId: string): Promise<Subscription | null>;
  findLatestByProviderCustomerId(providerCustomerId: string): Promise<Subscription | null>;
  findLatestByUserId(userId: string): Promise<Subscription | null>;
  findActiveByUserId(userId: string): Promise<Subscription | null>;
  /** Statuses: created | authenticated | active | pending | paused */
  findBlockingByUserId(userId: string): Promise<Subscription | null>;
  findAllAdmin(query: AdminSubscriptionListQuery): Promise<{
    items: AdminSubscriptionListRow[];
    totalCount: number;
  }>;
}
