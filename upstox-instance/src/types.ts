export type LiveMarketMetalQuote = {
  metal: 'GOLD' | 'SILVER';
  contractLtp: number;
  perGram: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  lastTradedAt?: string;
  instrumentKey: string;
};

export type LiveMarketMetalRates = {
  configured: boolean;
  asOf?: string;
  gold?: LiveMarketMetalQuote;
  silver?: LiveMarketMetalQuote;
};
