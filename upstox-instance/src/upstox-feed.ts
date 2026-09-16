import { randomBytes } from 'crypto';

import axios from 'axios';
import WebSocket from 'ws';

import { config } from './config';
import { buildRatesFromLtpc, extractLtpc, findFeed } from './rates';
import { decodeUpstoxFeedResponse } from './upstox-feed-protobuf';
import type { LiveMarketMetalRates } from './types';

type RatesListener = (rates: LiveMarketMetalRates) => void;

export class UpstoxFeedClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private running = false;
  private lastEmitAt = 0;
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
      const wsUrl = await this.fetchAuthorizedWebSocketUrl(config.upstox.accessToken);
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.on('open', () => {
        this.reconnectAttempt = 0;
        this.subscribe(ws);
        console.log('[upstox-feed] connected');
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
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
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
    const payload = {
      guid: randomBytes(12).toString('hex'),
      method: 'sub',
      data: {
        mode: 'ltpc',
        instrumentKeys: [config.upstox.goldInstrumentKey, config.upstox.silverInstrumentKey],
      },
    };
    ws.send(Buffer.from(JSON.stringify(payload)));
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
    const goldLtpc = extractLtpc(findFeed(feeds, config.upstox.goldInstrumentKey));
    const silverLtpc = extractLtpc(findFeed(feeds, config.upstox.silverInstrumentKey));
    if (!goldLtpc && !silverLtpc) return;

    const rates = buildRatesFromLtpc(goldLtpc, silverLtpc);
    if (!rates) return;

    const now = Date.now();
    if (now - this.lastEmitAt < 200) return;
    this.lastEmitAt = now;

    for (const listener of this.listeners) {
      listener(rates);
    }
  }
}
