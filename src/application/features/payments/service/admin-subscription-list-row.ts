import { Subscription } from '../domain';

export interface AdminSubscriptionListRow {
  subscription: Subscription;
  userEmail: string;
  userFirstName: string;
  userLastName: string;
  planName: string;
}
