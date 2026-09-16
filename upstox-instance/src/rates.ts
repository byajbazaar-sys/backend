import { config } from './config';
import type { LiveMarketMetalQuote, LiveMarketMetalRates } from './types';

type LtpcTick = { ltp?: number; cp?: number; ltt?: number | string };

let lastSnapshot: LiveMarketMetalRates = { configured: true };

export function getLatestRates(): LiveMarketMetalRates {
  return lastSnapshot;
}

export function buildRatesFromLtpc(
  goldLtpc?: LtpcTick,
  silverLtpc?: LtpcTick,
): LiveMarketMetalRates | null {
  const { upstox } = config;
  const gold = goldLtpc
    ? mapLtpcQuote('GOLD', upstox.goldInstrumentKey, goldLtpc, upstox.goldLtpGrams, false)
    : lastSnapshot.gold;
  const silver = silverLtpc
    ? mapLtpcQuote('SILVER', upstox.silverInstrumentKey, silverLtpc, 1000, upstox.silverLtpPerKg)
    : lastSnapshot.silver;

  if (!gold && !silver) {
    return null;
  }

  const rates: LiveMarketMetalRates = {
    configured: true,
    asOf: new Date().toISOString(),
    gold,
    silver,
  };
  lastSnapshot = rates;
  return rates;
}

function mapLtpcQuote(
  metal: 'GOLD' | 'SILVER',
  instrumentKey: string,
  tick: LtpcTick,
  divisor: number,
  ltpIsPerKg: boolean,
): LiveMarketMetalQuote | undefined {
  const contractLtp = tick.ltp;
  if (contractLtp == null || !Number.isFinite(contractLtp)) {
    return undefined;
  }

  const perGram = ltpIsPerKg ? contractLtp / divisor : contractLtp / divisor;
  const previousClose = tick.cp;
  let change: number | undefined;
  let changePercent: number | undefined;
  if (previousClose != null && Number.isFinite(previousClose) && previousClose > 0) {
    change = contractLtp - previousClose;
    changePercent = (change / previousClose) * 100;
  }

  return {
    metal,
    contractLtp,
    perGram: Math.round(perGram * 100) / 100,
    previousClose,
    change,
    changePercent: changePercent != null ? Math.round(changePercent * 100) / 100 : undefined,
    lastTradedAt: tick.ltt != null ? String(tick.ltt) : undefined,
    instrumentKey,
  };
}

export function findFeed<T>(feeds: Record<string, T>, instrumentKey: string): T | undefined {
  if (feeds[instrumentKey]) return feeds[instrumentKey];
  const alt = instrumentKey.replace('|', ':');
  if (feeds[alt]) return feeds[alt];
  const pipe = instrumentKey.replace(':', '|');
  if (feeds[pipe]) return feeds[pipe];
  const suffix = instrumentKey.split('|').pop() ?? instrumentKey.split(':').pop();
  if (!suffix) return undefined;
  const matchKey = Object.keys(feeds).find((key) => key.endsWith(`|${suffix}`) || key.endsWith(`:${suffix}`));
  return matchKey ? feeds[matchKey] : undefined;
}

export function extractLtpc(
  feed?: {
    ltpc?: LtpcTick;
    fullFeed?: { marketFF?: { ltpc?: LtpcTick }; indexFF?: { ltpc?: LtpcTick } };
  },
): LtpcTick | undefined {
  if (!feed) return undefined;
  if (feed.ltpc?.ltp != null) return feed.ltpc;
  return feed.fullFeed?.marketFF?.ltpc ?? feed.fullFeed?.indexFF?.ltpc;
}
