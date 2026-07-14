import {
  AdminSubscriptionDetailResponseModel,
  AdminSubscriptionsPagedResponseModel,
  CreateRefundRequestModel,
  ExtendTrialRequestModel,
  ListAdminSubscriptionsQueryModel,
  RefundResponseModel,
} from '../models';

export const SUBSCRIPTION_ADMIN_SERVICE = 'SUBSCRIPTION_ADMIN_SERVICE';

export interface ISubscriptionAdminService {
  list(query: ListAdminSubscriptionsQueryModel): Promise<AdminSubscriptionsPagedResponseModel>;
  getById(id: string): Promise<AdminSubscriptionDetailResponseModel>;
  cancel(id: string): Promise<AdminSubscriptionDetailResponseModel>;
  resume(id: string): Promise<AdminSubscriptionDetailResponseModel>;
  sync(id: string): Promise<AdminSubscriptionDetailResponseModel>;
  refundPayment(paymentId: string, body: CreateRefundRequestModel): Promise<RefundResponseModel>;
  extendTrial(id: string, body: ExtendTrialRequestModel): Promise<AdminSubscriptionDetailResponseModel>;
}
