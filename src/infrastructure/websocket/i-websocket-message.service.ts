export const WEBSOCKET_MESSAGE_SERVICE = 'WEBSOCKET_MESSAGE_SERVICE';

export interface IWebSocketMessageService {
  sendToConnection(connectionId: string, payload: Record<string, unknown>): Promise<void>;
  broadcastToSession(
    desktopConnectionId: string | undefined,
    mobileConnectionId: string | undefined,
    payload: Record<string, unknown>,
    excludeConnectionId?: string,
  ): Promise<void>;
}
