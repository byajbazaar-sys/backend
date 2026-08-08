import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { JwtService } from '@nestjs/jwt';
import { UsersAuthOptions } from '@shared-libs';
import {
  IWebSocketConnectionsRepository,
  WEBSOCKET_CONNECTIONS_REPOSITORY,
  WEBSOCKET_MESSAGE_SERVICE,
  IWebSocketMessageService,
} from '../application';
import {
  getTokenFromEvent,
  getWebSocketApp,
  getWebSocketHandler,
  parseBody,
  wsResponse,
} from './websocket-bootstrap';

function logWs(
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
) {
  const line = meta ? `${message} ${JSON.stringify(meta)}` : message;
  if (level === 'error') console.error(`[WS:message] ${line}`);
  else if (level === 'warn') console.warn(`[WS:message] ${line}`);
  else console.log(`[WS:message] ${line}`);
}

async function getUserIdFromToken(token: string): Promise<string> {
  const app = await getWebSocketApp();
  const jwtService = app.get(JwtService);
  const options = app.get(UsersAuthOptions);
  try {
    const payload = jwtService.verify(token, {
      secret: options.secret,
      audience: options.audience,
      issuer: options.issuer,
      algorithms: [options.algorithm],
    }) as { userId?: string; sub?: string };

    const userId = payload.userId ?? payload.sub;
    if (!userId) {
      throw new Error('JWT payload missing userId');
    }
    return userId;
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'verify failed';
    throw new Error(`Unauthorized: invalid token (${reason})`);
  }
}

async function resolveUserId(connectionId: string, token: string): Promise<string> {
  const tokenSource = token ? 'message' : 'none';

  if (token) {
    try {
      const userId = await getUserIdFromToken(token);
      logWs('info', 'Resolved userId from JWT', { connectionId, tokenSource });
      return userId;
    } catch (err) {
      logWs('warn', 'JWT verification failed, trying connection record', {
        connectionId,
        tokenSource,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    logWs('warn', 'No token on message event (API GW omits $connect query params)', {
      connectionId,
    });
  }

  const app = await getWebSocketApp();
  const connectionsRepo = app.get<IWebSocketConnectionsRepository>(WEBSOCKET_CONNECTIONS_REPOSITORY);
  const connection = await connectionsRepo.findByConnectionId(connectionId);

  if (connection?.userId && !connection.disconnectedAt) {
    logWs('info', 'Resolved userId from connection record', {
      connectionId,
      userId: connection.userId,
      deviceType: connection.deviceType,
    });
    return connection.userId;
  }

  logWs('error', 'Unauthorized — no valid token and no active connection', {
    connectionId,
    hasConnection: !!connection,
    disconnected: !!connection?.disconnectedAt,
  });
  throw new Error('Unauthorized: reconnect WebSocket');
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const connectionId = event.requestContext.connectionId;
  let routeKey = event.requestContext.routeKey;
  const body = parseBody(event);
  const evt = event as APIGatewayProxyWebsocketEventV2 & {
    queryStringParameters?: Record<string, string>;
    headers?: Record<string, string>;
  };
  const queryToken = getTokenFromEvent({
    queryStringParameters: evt.queryStringParameters,
    headers: evt.headers,
  });
  const bodyToken = body.token as string;
  const token = queryToken ?? bodyToken;

  if (routeKey === '$default' && typeof body.action === 'string') {
    routeKey = body.action;
  }

  logWs('info', `Route ${routeKey}`, {
    connectionId,
    hasQueryToken: !!queryToken,
    hasBodyToken: !!bodyToken,
    sessionId: body.sessionId,
  });

  try {
    const app = await getWebSocketApp();
    const wsHandler = await getWebSocketHandler();
    const wsMessage = app.get<IWebSocketMessageService>(WEBSOCKET_MESSAGE_SERVICE);
    let result: Record<string, unknown>;

    switch (routeKey) {
      case 'createSession': {
        const userId = await resolveUserId(connectionId, token);
        result = await wsHandler.handleCreateSession(connectionId, userId, body);
        logWs('info', 'createSession OK', { connectionId, userId, sessionId: body.sessionId });
        break;
      }
      case 'joinSession': {
        result = await wsHandler.handleJoinSession(connectionId, '', body);
        logWs('info', 'joinSession OK', { connectionId, sessionId: body.sessionId });
        break;
      }
      case 'barcodeScanned': {
        result = await wsHandler.handleBarcodeScanned(connectionId, '', body);
        logWs('info', 'barcodeScanned OK', { connectionId, barcode: body.barcode });
        break;
      }
      case 'cartUpdated': {
        const userId = await resolveUserId(connectionId, token);
        result = await wsHandler.handleCartUpdated(connectionId, userId, body);
        break;
      }
      case 'cartItemRemoved': {
        const userId = await resolveUserId(connectionId, token);
        result = await wsHandler.handleCartItemRemoved(connectionId, userId, body);
        logWs('info', 'cartItemRemoved OK', { connectionId, barcode: body.barcode });
        break;
      }
      case 'syncCartState': {
        const userId = await resolveUserId(connectionId, token);
        result = await wsHandler.handleSyncCartState(connectionId, userId, body);
        logWs('info', 'syncCartState OK', { connectionId, count: (body.barcodes as unknown[])?.length });
        break;
      }
      case 'cartCleared': {
        const userId = await resolveUserId(connectionId, token);
        result = await wsHandler.handleCartCleared(connectionId, userId, body);
        logWs('info', 'cartCleared OK', { connectionId, sessionId: body.sessionId });
        break;
      }
      case 'leaveSession': {
        result = await wsHandler.handleLeaveSession(connectionId, body);
        logWs('info', 'leaveSession OK', { connectionId, sessionId: body.sessionId });
        break;
      }
      case 'heartbeat':
        result = await wsHandler.handleHeartbeat(connectionId);
        break;
      default:
        logWs('warn', 'Unknown route', { connectionId, routeKey });
        return wsResponse(400, { error: 'Unknown route' });
    }

    await wsMessage.sendToConnection(connectionId, result);
    return wsResponse(200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    logWs('error', `${routeKey} failed`, { connectionId, message });
    try {
      const app = await getWebSocketApp();
      const wsMessage = app.get<IWebSocketMessageService>(WEBSOCKET_MESSAGE_SERVICE);
      await wsMessage.sendToConnection(connectionId, {
        type: 'error',
        message,
        route: routeKey,
        ...(routeKey === 'barcodeScanned' && body.barcode
          ? { barcode: String(body.barcode) }
          : {}),
      });
    } catch {
      // ignore secondary failure
    }
    return wsResponse(400, { error: message });
  }
};
