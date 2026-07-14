import { Paged } from '@shared-libs';
import { JewelleryEvent } from '../domain';
import { EJewelleryEventStatus } from '../domain';

export const JEWELLERY_EVENTS_REPOSITORY = 'JEWELLERY_EVENTS_REPOSITORY';

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

export interface IJewelleryEventsRepository {
  create(data: JewelleryEvent): Promise<JewelleryEvent>;
  update(id: string, data: Partial<JewelleryEvent>): Promise<JewelleryEvent>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<JewelleryEvent | null>;
  findBySlug(slug: string): Promise<JewelleryEvent | null>;
  findDuplicate(params: {
    name: string;
    city?: string | null;
    startDate?: Date | string | null;
  }): Promise<JewelleryEvent | null>;
  list(filter: JewelleryEventsFilter): Promise<Paged<JewelleryEvent>>;
  findRelated(params: {
    excludeId: string;
    city?: string | null;
    state?: string | null;
    limit?: number;
  }): Promise<JewelleryEvent[]>;
  upsertBySlug(data: JewelleryEvent): Promise<JewelleryEvent>;
  listActiveSlugs(): Promise<Array<{ slug: string; updatedAt: Date }>>;
}
