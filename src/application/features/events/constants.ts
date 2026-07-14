export const JEWELLERY_EVENT_SYNC_STATES = [
  'Madhya Pradesh',
  'Maharashtra',
  'Delhi',
  'Gujarat',
  'Rajasthan',
] as const;

export type JewelleryEventSyncState = (typeof JEWELLERY_EVENT_SYNC_STATES)[number];
