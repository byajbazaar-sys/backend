import { randomBytes } from 'crypto';

import axios from 'axios';
import WebSocket from 'ws';

import { config } from './config';
import { resolveUpstoxInstrumentKeys } from './instruments';
import { buildRatesFromLtpc, extractLtpc, extractQuoteTick, findFeed, resetLatestRates } from './rates';
import { decodeUpstoxFeedResponse } from './upstox-feed-protobuf';
import type { LiveMarketMetalRates } from './types';
import type { UpstoxInstrumentKeys } from './instruments';

type RatesListener = (rates: LiveMarketMetalRates) => void;

function upstoxAuthorizationHeaders(): { Accept: string; Authorization: string } {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${config.upstox.accessToken}`,
  };
}

export class UpstoxFeedClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private running = false;
  private lastEmitAt = 0;
  private instrumentRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private restRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private restRefreshStarted = false;
  private instrumentKeys: UpstoxInstrumentKeys | null = null;
  private readonly listeners = new Set<RatesListener>();

  onRates(listener: RatesListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.instrumentRefreshTimer) {
      clearTimeout(this.instrumentRefreshTimer);
      this.instrumentRefreshTimer = null;
    }
    if (this.restRefreshTimer) {
      clearTimeout(this.restRefreshTimer);
      this.restRefreshTimer = null;
    }
    this.restRefreshStarted = false;
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(3000 * this.reconnectAttempt, 30_000);
    this.reconnectTimer = setTimeout(() => void this.connect(), delay);
  }

  private async connect(): Promise<void> {
    try {
      const previousInstrumentKeys = this.instrumentKeys;
      const resolvedInstrumentKeys = await resolveUpstoxInstrumentKeys({
        gold: config.upstox.goldInstrumentKey,
        silver: config.upstox.silverInstrumentKey,
      });
      if (
        previousInstrumentKeys &&
        (previousInstrumentKeys.gold !== resolvedInstrumentKeys.gold ||
          previousInstrumentKeys.silver !== resolvedInstrumentKeys.silver)
      ) {
        resetLatestRates();
      }
      this.instrumentKeys = resolvedInstrumentKeys;
      if (!this.restRefreshStarted) {
        this.restRefreshStarted = true;
        void this.refreshRestSnapshot();
      }
      const wsUrl = await this.fetchAuthorizedWebSocketUrl(config.upstox.accessToken);
      const ws = new WebSocket(wsUrl, { followRedirects: true });
      this.ws = ws;

      ws.on('open', () => {
        this.reconnectAttempt = 0;
        this.subscribe(ws);
        this.scheduleInstrumentRefresh();
        console.log(
          `[upstox-feed] connected (gold ${this.instrumentKeys?.gold}, silver ${this.instrumentKeys?.silver})`,
        );
      });

      ws.on('message', (data) => {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        this.handleMessage(buffer);
      });

      ws.on('close', () => {
        this.ws = null;
        if (this.running) this.scheduleReconnect();
      });

      ws.on('error', (err) => {
        console.warn('[upstox-feed] error', err);
        ws.close();
      });
    } catch (err) {
      console.warn('[upstox-feed] connect failed', err);
      this.scheduleReconnect();
    }
  }

  private async fetchAuthorizedWebSocketUrl(accessToken: string): Promise<string> {
    const res = await axios.get<{ status?: string; data?: { authorized_redirect_uri?: string } }>(
      'https://api.upstox.com/v3/feed/market-data-feed/authorize',
      {
        headers: upstoxAuthorizationHeaders(),
        timeout: 12_000,
        validateStatus: (status) => status < 500,
      },
    );
    const uri = res.data?.data?.authorized_redirect_uri?.trim();
    if (res.status !== 200 || !uri) {
      throw new Error(`Upstox authorize failed (HTTP ${res.status})`);
    }
    return uri;
  }

  private subscribe(ws: WebSocket): void {
    if (!this.instrumentKeys) {
      throw new Error('Upstox instrument keys have not been resolved');
    }
    const payload = {
      guid: randomBytes(12).toString('hex'),
      method: 'sub',
      data: {
        mode: 'ltpc',
        instrumentKeys: [this.instrumentKeys.gold, this.instrumentKeys.silver],
      },
    };
    ws.send(Buffer.from(JSON.stringify(payload)));
  }

  private scheduleInstrumentRefresh(): void {
    if (this.instrumentRefreshTimer) clearTimeout(this.instrumentRefreshTimer);
    this.instrumentRefreshTimer = setTimeout(() => void this.refreshInstrumentKeys(), 6 * 60 * 60 * 1000);
  }

  private scheduleRestRefresh(): void {
    if (!this.running) return;
    if (this.restRefreshTimer) clearTimeout(this.restRefreshTimer);
    this.restRefreshTimer = setTimeout(() => void this.refreshRestSnapshot(), 30_000);
  }

  private async refreshRestSnapshot(): Promise<void> {
    if (!this.running || !this.instrumentKeys) return;
    try {
      const response = await axios.get<{ data?: Record<string, { instrument_token?: string; last_price?: number }> }>(
        'https://api.upstox.com/v2/market-quote/ltp',
        {
          headers: upstoxAuthorizationHeaders(),
          params: {
            instrument_key: [this.instrumentKeys.gold, this.instrumentKeys.silver].join(','),
          },
          timeout: 12_000,
          validateStatus: (status) => status < 500,
        },
      );
      if (response.status !== 200 || !response.data?.data) {
        throw new Error(`Upstox LTP snapshot failed (HTTP ${response.status})`);
      }

      const goldLtpc = extractQuoteTick(response.data.data, this.instrumentKeys.gold);
      const silverLtpc = extractQuoteTick(response.data.data, this.instrumentKeys.silver);
      if (!goldLtpc && !silverLtpc) {
        throw new Error('Upstox LTP snapshot did not include either subscribed contract');
      }

      const rates = buildRatesFromLtpc(goldLtpc, silverLtpc, this.instrumentKeys);
      if (rates) this.emitRates(rates);
    } catch (err) {
      console.warn('[upstox-feed] REST snapshot failed', err);
    }
    this.scheduleRestRefresh();
  }

  private async refreshInstrumentKeys(): Promise<void> {
    if (!this.running) return;
    try {
      const latest = await resolveUpstoxInstrumentKeys({
        gold: config.upstox.goldInstrumentKey,
        silver: config.upstox.silverInstrumentKey,
      });
      const current = this.instrumentKeys;
      if (!current || current.gold !== latest.gold || current.silver !== latest.silver) {
        this.instrumentKeys = latest;
        resetLatestRates();
        console.log('[upstox-feed] MCX front-month contracts changed; reconnecting');
        this.ws?.close();
        return;
      }
    } catch (err) {
      console.warn('[upstox-feed] instrument refresh failed', err);
    }
    this.scheduleInstrumentRefresh();
  }

  private handleMessage(buffer: Buffer): void {
    if (!buffer.length) return;

    let decoded;
    try {
      decoded = decodeUpstoxFeedResponse(buffer);
    } catch {
      return;
    }

    const plain = decoded.toJSON() as {
      feeds?: Record<
        string,
        {
          ltpc?: { ltp?: number; cp?: number; ltt?: number | string };
          fullFeed?: { marketFF?: { ltpc?: { ltp?: number; cp?: number } }; indexFF?: { ltpc?: { ltp?: number; cp?: number } } };
        }
      >;
    };

    const feeds = plain.feeds ?? {};
    if (!this.instrumentKeys) return;
    const goldLtpc = extractLtpc(findFeed(feeds, this.instrumentKeys.gold));
    const silverLtpc = extractLtpc(findFeed(feeds, this.instrumentKeys.silver));
    if (!goldLtpc && !silverLtpc) return;

    const rates = buildRatesFromLtpc(goldLtpc, silverLtpc, this.instrumentKeys);
    if (!rates) return;

    const now = Date.now();
    if (now - this.lastEmitAt < 200) return;
    this.lastEmitAt = now;

    this.emitRates(rates);
  }

  private emitRates(rates: LiveMarketMetalRates): void {
    this.lastEmitAt = Date.now();
    for (const listener of this.listeners) {
      listener(rates);
    }
  }
}
