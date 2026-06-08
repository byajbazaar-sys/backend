import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { EDeviceType } from '../application/features/inventory/enums';
import { getTokenFromEvent, getWebSocketHandler, wsResponse } from './websocket-bootstrap';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const connectionId = event.requestContext.connectionId;
  const evt = event as APIGatewayProxyWebsocketEventV2 & {
    queryStringParameters?: Record<string, string | undefined> | null;
    headers?: Record<string, string | undefined> | null;
  };
  const token = getTokenFromEvent({
    queryStringParameters: evt.queryStringParameters,
    headers: evt.headers,
  });
  const deviceTypeParam = evt.queryStringParameters?.deviceType;
  const deviceType =
    deviceTypeParam === EDeviceType.Mobile ? EDeviceType.Mobile : EDeviceType.Desktop;

  console.log('[WS:connect] Attempt', JSON.stringify({
    connectionId,
    deviceType,
    hasToken: !!token,
    tokenLength: token?.length ?? 0,
  }));

  try {
    const wsHandler = await getWebSocketHandler();
    const result = await wsHandler.handleConnect(connectionId, token, deviceType);

    console.log('[WS:connect] Result', JSON.stringify({
      connectionId,
      deviceType,
      statusCode: result.statusCode,
    }));

    return wsResponse(result.statusCode);
  } catch (error) {
    console.error('[WS:connect] Error', JSON.stringify({
      connectionId,
      deviceType,
      error: error instanceof Error ? error.message : String(error),
    }));
    return wsResponse(500);
  }
};
