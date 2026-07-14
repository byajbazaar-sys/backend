import { JewelleryEvent } from '../domain';
import {
  CreateJewelleryEventRequestModel,
  ListJewelleryEventsQueryModel,
  UpdateJewelleryEventRequestModel,
} from '../models';
import { DiscoveredEvent } from '../../../shared';
import { Paged } from '@shared-libs';

export const JEWELLERY_EVENT_SERVICE = 'JEWELLERY_EVENT_SERVICE';

export interface IJewelleryEventService {
  listPublic(query: ListJewelleryEventsQueryModel): Promise<Paged<JewelleryEvent>>;
  getBySlug(slug: string): Promise<{ event: JewelleryEvent; related: JewelleryEvent[] }>;
  listAdmin(query: ListJewelleryEventsQueryModel): Promise<Paged<JewelleryEvent>>;
  create(body: CreateJewelleryEventRequestModel): Promise<JewelleryEvent>;
  update(id: string, body: UpdateJewelleryEventRequestModel): Promise<JewelleryEvent>;
  delete(id: string): Promise<void>;
  fetchStateEvents(state: string): Promise<DiscoveredEvent[]>;
  mergeAndUpsert(events: DiscoveredEvent[]): Promise<{ upserted: number }>;
  syncStates(states?: string[]): Promise<{ states: string[]; upserted: number }>;
  listActiveSlugs(): Promise<Array<{ slug: string; updatedAt: Date }>>;
}
