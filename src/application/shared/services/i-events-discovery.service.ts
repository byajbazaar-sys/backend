export interface DiscoveredEvent {
  name?: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  state?: string;
  venue?: string;
  organizer?: string;
  category?: string;
  website?: string;
  registrationUrl?: string;
  sourceUrl?: string;
  description?: string;
  slug?: string;
  visitorEntryFee?: string;
  stallFee?: string;
  contactEmail?: string;
  contactPhone?: string;
  tags?: string[];
}

export interface DiscoveredEventsPayload {
  events: DiscoveredEvent[];
}

export const EVENTS_DISCOVERY_SERVICE = 'EVENTS_DISCOVERY_SERVICE';

export interface IEventsDiscoveryService {
  fetchBasicEventsForState(state: string): Promise<DiscoveredEvent[]>;
  enrichEvents(events: DiscoveredEvent[]): Promise<DiscoveredEvent[]>;
}
