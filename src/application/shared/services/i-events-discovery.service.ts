import { DiscoveredEvent } from './discovered-event';

export const EVENTS_DISCOVERY_SERVICE = 'EVENTS_DISCOVERY_SERVICE';

export interface IEventsDiscoveryService {
  fetchBasicEventsForState(state: string): Promise<DiscoveredEvent[]>;
  enrichEvents(events: DiscoveredEvent[]): Promise<DiscoveredEvent[]>;
}
