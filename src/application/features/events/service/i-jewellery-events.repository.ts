import { Paged } from '@shared-libs';

import { JewelleryEvent, JewelleryEventDuplicateQuery, JewelleryEventRelatedQuery } from '../domain';
import { JewelleryEventUpdatePatch } from '../models';
import { JewelleryEventsFilter } from './jewellery-events-filter';

export const JEWELLERY_EVENTS_REPOSITORY = 'JEWELLERY_EVENTS_REPOSITORY';

export interface IJewelleryEventsRepository {
  create(data: JewelleryEvent): Promise<JewelleryEvent>;
  update(id: string, data: JewelleryEventUpdatePatch): Promise<JewelleryEvent>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<JewelleryEvent>;
  findBySlug(slug: string): Promise<JewelleryEvent>;
  findDuplicate(params: JewelleryEventDuplicateQuery): Promise<JewelleryEvent>;
  list(filter: JewelleryEventsFilter): Promise<Paged<JewelleryEvent>>;
  findRelated(params: JewelleryEventRelatedQuery): Promise<JewelleryEvent[]>;
  upsertBySlug(data: JewelleryEvent): Promise<JewelleryEvent>;
  listActiveSlugs(): Promise<{ slug: string; updatedAt: Date }[]>;
}
