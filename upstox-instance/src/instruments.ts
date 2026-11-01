import axios from 'axios';
import { gunzipSync } from 'zlib';

const INSTRUMENT_MASTER_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/MCX.csv.gz';
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

export type UpstoxInstrumentKeys = {
  gold: string;
  silver: string;
};

type InstrumentRow = {
  instrumentKey: string;
  tradingSymbol: string;
  name: string;
  expiry: string;
  instrumentType: string;
};

let cachedInstruments: { rows: InstrumentRow[]; expiresAt: number } | undefined;

export async function resolveUpstoxInstrumentKeys(
  overrides: { gold?: string; silver?: string },
  now = new Date(),
): Promise<UpstoxInstrumentKeys> {
  const instruments = await getCurrentMxcInstruments();
  const automatic = getCurrentFrontMonthInstrumentKeys(instruments, now);
  return {
    gold: findValidOverride(instruments, overrides.gold, 'GOLD', now)?.instrumentKey ?? automatic.gold,
    silver: findValidOverride(instruments, overrides.silver, 'SILVER', now)?.instrumentKey ?? automatic.silver,
  };
}

async function getCurrentMxcInstruments(): Promise<InstrumentRow[]> {
  if (!cachedInstruments || cachedInstruments.expiresAt <= Date.now()) {
    const response = await axios.get<ArrayBuffer>(INSTRUMENT_MASTER_URL, {
      responseType: 'arraybuffer',
      timeout: 15_000,
    });
    let contents = Buffer.from(response.data);
    if (contents[0] === 0x1f && contents[1] === 0x8b) {
      contents = gunzipSync(contents);
    }

    const rows = contents
      .toString('utf8')
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map(parseInstrumentRow)
      .filter((instrument): instrument is InstrumentRow => instrument !== undefined);
    cachedInstruments = { rows, expiresAt: Date.now() + CACHE_DURATION_MS };
  }

  return cachedInstruments.rows;
}

function getCurrentFrontMonthInstrumentKeys(instruments: InstrumentRow[], now: Date): UpstoxInstrumentKeys {
  const gold = findFrontMonthInstrument(instruments, 'GOLD', now);
  const silver = findFrontMonthInstrument(instruments, 'SILVER', now);

  if (!gold || !silver) {
    throw new Error('Upstox MCX instrument master has no unexpired standard gold and silver futures');
  }

  return { gold: gold.instrumentKey, silver: silver.instrumentKey };
}

function findValidOverride(
  instruments: InstrumentRow[],
  instrumentKey: string | undefined,
  metal: 'GOLD' | 'SILVER',
  now: Date,
): InstrumentRow | undefined {
  if (!instrumentKey) return undefined;
  const today = formatIndianDate(now);
  const symbolPattern = metal === 'GOLD' ? /^GOLD\d{2}[A-Z]{3}FUT$/ : /^SILVER\d{2}[A-Z]{3}FUT$/;

  return instruments.find(
    (instrument) =>
      instrument.instrumentKey === instrumentKey &&
      instrument.name === metal &&
      instrument.instrumentType === 'FUTCOM' &&
      symbolPattern.test(instrument.tradingSymbol) &&
      /^\d{4}-\d{2}-\d{2}$/.test(instrument.expiry) &&
      instrument.expiry > today,
  );
}

function findFrontMonthInstrument(
  instruments: InstrumentRow[],
  metal: 'GOLD' | 'SILVER',
  now: Date,
): InstrumentRow | undefined {
  const today = formatIndianDate(now);
  const symbolPattern = metal === 'GOLD' ? /^GOLD\d{2}[A-Z]{3}FUT$/ : /^SILVER\d{2}[A-Z]{3}FUT$/;

  return instruments
    .filter(
      (instrument) =>
        instrument.name === metal &&
        instrument.instrumentType === 'FUTCOM' &&
        symbolPattern.test(instrument.tradingSymbol) &&
        /^\d{4}-\d{2}-\d{2}$/.test(instrument.expiry) &&
        instrument.expiry > today,
    )
    .sort((left, right) => left.expiry.localeCompare(right.expiry))[0];
}

function formatIndianDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function parseInstrumentRow(line: string): InstrumentRow | undefined {
  const columns = line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g);
  if (!columns || columns.length < 12) return undefined;
  const values = columns.map((column) => column.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
  const [instrumentKey, , tradingSymbol, name, , expiry, , , , instrumentType] = values;

  if (!instrumentKey || !tradingSymbol || !name || !expiry || !instrumentType) return undefined;
  return { instrumentKey, tradingSymbol, name, expiry, instrumentType };
}
