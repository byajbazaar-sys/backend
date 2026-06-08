import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { EDeviceType } from '../application/features/inventory/enums';
import { getTokenFromEvent, getWebSocketHandler, wsResponse } from './websocket-bootstrap';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
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

    const wsHandler = await getWebSocketHandler();
    const result = await wsHandler.handleConnect(connectionId, token, deviceType);
    return wsResponse(result.statusCode);
  } catch (error) {
    console.error('WebSocket connect error:', error);
    return wsResponse(500);
  }
};
