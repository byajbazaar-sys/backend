import { Paged } from '@shared-libs';

import { JewelleryEvent, JewelleryEventDetailResult } from '../domain';
import {
  CreateJewelleryEventRequestModel,
  ListJewelleryEventsQueryModel,
  UpdateJewelleryEventRequestModel,
} from '../models';

export const JEWELLERY_EVENT_SERVICE = 'JEWELLERY_EVENT_SERVICE';

export interface IJewelleryEventService {
  listPublic(query: ListJewelleryEventsQueryModel): Promise<Paged<JewelleryEvent>>;
  getBySlug(slug: string): Promise<JewelleryEventDetailResult>;
  listAdmin(query: ListJewelleryEventsQueryModel): Promise<Paged<JewelleryEvent>>;
  create(body: CreateJewelleryEventRequestModel): Promise<JewelleryEvent>;
  update(id: string, body: UpdateJewelleryEventRequestModel): Promise<JewelleryEvent>;
  delete(id: string): Promise<void>;
}
