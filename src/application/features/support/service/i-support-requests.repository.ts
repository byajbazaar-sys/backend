import { SupportRequest } from '../domain';

export const SUPPORT_REQUESTS_REPOSITORY = 'SUPPORT_REQUESTS_REPOSITORY';

export interface ISupportRequestsRepository {
  create(data: SupportRequest): Promise<SupportRequest>;
}
