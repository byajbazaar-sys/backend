import http from 'http';

import { WebSocket, WebSocketServer } from 'ws';

import { extractTokenFromUrl, verifyByajbazaarToken } from './auth';
import { config } from './config';
import { getLatestRates } from './rates';
import { UpstoxFeedClient } from './upstox-feed';
import type { LiveMarketMetalRates } from './types';

const clients = new Set<WebSocket>();
const feed = new UpstoxFeedClient();

function broadcast(rates: LiveMarketMetalRates): void {
  const payload = JSON.stringify({
    type: 'liveMarketRatesUpdated',
    rates,
    timestamp: new Date().toISOString(),
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

feed.onRates(broadcast);
feed.start();

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: clients.size }));
    return;
  }

  if (req.url === '/api/latest') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getLatestRates()));
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  try {
    const token = extractTokenFromUrl(request.url ?? '');
    verifyByajbazaarToken(token);
  } catch (err) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws, request) => {
  clients.add(ws);

  const latest = getLatestRates();
  if (latest.gold || latest.silver) {
    ws.send(
      JSON.stringify({
        type: 'liveMarketRatesUpdated',
        rates: latest,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(String(raw)) as { action?: string };
      if (data.action === 'heartbeat') {
        ws.send(JSON.stringify({ type: 'heartbeatAck', timestamp: new Date().toISOString() }));
      }
    } catch {
      // ignore
    }
  });

  const ip = request.socket.remoteAddress ?? 'unknown';
  console.log(`[ws] client connected from ${ip} (total ${clients.size})`);
});

server.listen(config.port, config.host, () => {
  console.log(`[server] Upstox relay listening on ${config.host}:${config.port}`);
});

process.on('SIGINT', () => {
  feed.stop();
  wss.close();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  feed.stop();
  wss.close();
  server.close(() => process.exit(0));
});
