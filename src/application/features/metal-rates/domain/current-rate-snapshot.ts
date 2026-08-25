export class CurrentRateSnapshot {
  gold24: number | null;
  gold22: number | null;
  gold20: number | null;
  gold18: number | null;
  silver999: number | null;
  silver925: number | null;
}

export function createEmptyCurrentRateSnapshot(): CurrentRateSnapshot {
  return {
    gold24: null,
    gold22: null,
    gold20: null,
    gold18: null,
    silver999: null,
    silver925: null,
  };
}
