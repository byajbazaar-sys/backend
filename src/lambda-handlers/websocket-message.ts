import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { JwtService } from '@nestjs/jwt';
import { UsersAuthOptions } from '@shared-libs';
import { WEBSOCKET_MESSAGE_SERVICE, IWebSocketMessageService } from '../infrastructure/websocket/i-websocket-message.service';
import {
  getTokenFromEvent,
  getWebSocketApp,
  getWebSocketHandler,
  parseBody,
  wsResponse,
} from './websocket-bootstrap';

async function getUserIdFromToken(token: string | undefined): Promise<string> {
  if (!token) throw new Error('Unauthorized');
  const app = await getWebSocketApp();
  const jwtService = app.get(JwtService);
  const options = app.get(UsersAuthOptions);
  const payload = jwtService.verify(token, {
    secret: options.secret,
    audience: options.audience,
    issuer: options.issuer,
    algorithms: [options.algorithm],
  }) as { userId: string };
  return payload.userId;
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const connectionId = event.requestContext.connectionId;
  let routeKey = event.requestContext.routeKey;
  const body = parseBody(event);
  const evt = event as APIGatewayProxyWebsocketEventV2 & {
    queryStringParameters?: Record<string, string | undefined> | null;
    headers?: Record<string, string | undefined> | null;
  };
  const token =
    getTokenFromEvent({
      queryStringParameters: evt.queryStringParameters,
      headers: evt.headers,
    }) ?? (body.token as string | undefined);

  if (routeKey === '$default' && typeof body.action === 'string') {
    routeKey = body.action;
  }

  try {
    const app = await getWebSocketApp();
    const wsHandler = await getWebSocketHandler();
    const wsMessage = app.get<IWebSocketMessageService>(WEBSOCKET_MESSAGE_SERVICE);
    let result: Record<string, unknown>;

    switch (routeKey) {
      case 'createSession': {
        const userId = await getUserIdFromToken(token);
        result = await wsHandler.handleCreateSession(connectionId, userId, body);
        break;
      }
      case 'joinSession': {
        result = await wsHandler.handleJoinSession(connectionId, '', body);
        break;
      }
      case 'barcodeScanned': {
        result = await wsHandler.handleBarcodeScanned(connectionId, '', body);
        break;
      }
      case 'cartUpdated': {
        const userId = await getUserIdFromToken(token);
        result = await wsHandler.handleCartUpdated(connectionId, userId, body);
        break;
      }
      case 'heartbeat':
        result = await wsHandler.handleHeartbeat(connectionId);
        break;
      default:
        return wsResponse(400, { error: 'Unknown route' });
    }

    await wsMessage.sendToConnection(connectionId, result);
    return wsResponse(200);
  } catch (error) {
    console.error(`WebSocket ${routeKey} error:`, error);
    const message = error instanceof Error ? error.message : 'Internal error';
    try {
      const app = await getWebSocketApp();
      const wsMessage = app.get<IWebSocketMessageService>(WEBSOCKET_MESSAGE_SERVICE);
      await wsMessage.sendToConnection(connectionId, { type: 'error', message });
    } catch {
      // ignore secondary failure
    }
    return wsResponse(400, { error: message });
  }
};
