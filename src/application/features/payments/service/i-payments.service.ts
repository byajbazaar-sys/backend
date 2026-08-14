import { SubscriptionUserProfileData } from '../domain';
import {
  ApplyCouponRequestModel,
  ApplyCouponResponseModel,
  CancelSubscriptionRequestModel,
  CreateSubscriptionRequestModel,
  CreateSubscriptionResponseModel,
  PaymentResponseModel,
  SubscriptionStatusResponseModel,
} from '../models';

export const PAYMENTS_SERVICE = 'PAYMENTS_SERVICE';

export interface IPaymentsService {
  hasActiveSubscription(userId: string): Promise<boolean>;
  hasAppAccess(userId: string): Promise<boolean>;
  createSubscription(
    userId: string,
    body: CreateSubscriptionRequestModel,
    userProfile: SubscriptionUserProfileData,
  ): Promise<CreateSubscriptionResponseModel>;
  getStatus(userId: string): Promise<SubscriptionStatusResponseModel>;
  cancel(userId: string, body: CancelSubscriptionRequestModel): Promise<SubscriptionStatusResponseModel>;
  resume(userId: string): Promise<SubscriptionStatusResponseModel>;
  applyCoupon(userId: string, body: ApplyCouponRequestModel): Promise<ApplyCouponResponseModel>;
  listPayments(userId: string, page?: number, pageSize?: number): Promise<PaymentResponseModel[]>;
}
