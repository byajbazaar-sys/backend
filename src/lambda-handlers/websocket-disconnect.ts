import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';

import { getWebSocketHandler } from './websocket-bootstrap';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const connectionId = event.requestContext.connectionId;
    const wsHandler = await getWebSocketHandler();
    await wsHandler.handleDisconnect(connectionId);
    return { statusCode: 200 };
  } catch (error) {
    console.error('WebSocket disconnect error:', error);
    return { statusCode: 500 };
  }
};
