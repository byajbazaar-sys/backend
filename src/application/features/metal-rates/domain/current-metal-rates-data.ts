export class CurrentMetalRatesData {
  gold24: number | null;
  gold22: number | null;
  gold20: number | null;
  gold18: number | null;
  silver999: number | null;
  silver925: number | null;
  gold24UpdatedAt: string | null;
  gold22UpdatedAt: string | null;
  gold20UpdatedAt: string | null;
  gold18UpdatedAt: string | null;
  silver999UpdatedAt: string | null;
  silver925UpdatedAt: string | null;
}

export function createEmptyCurrentMetalRatesData(): CurrentMetalRatesData {
  return {
    gold24: null,
    gold22: null,
    gold20: null,
    gold18: null,
    silver999: null,
    silver925: null,
    gold24UpdatedAt: null,
    gold22UpdatedAt: null,
    gold20UpdatedAt: null,
    gold18UpdatedAt: null,
    silver999UpdatedAt: null,
    silver925UpdatedAt: null,
  };
}
