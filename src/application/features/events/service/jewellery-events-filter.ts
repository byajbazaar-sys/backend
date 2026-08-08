import { EJewelleryEventStatus } from '../domain';

export interface JewelleryEventsFilter {
  pageNumber?: number;
  pageSize?: number;
  city?: string;
  state?: string;
  status?: EJewelleryEventStatus;
  search?: string;
  featured?: boolean;
  upcomingOnly?: boolean;
}
