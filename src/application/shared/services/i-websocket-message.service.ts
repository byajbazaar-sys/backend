export const WEBSOCKET_MESSAGE_SERVICE = 'WEBSOCKET_MESSAGE_SERVICE';

export interface IWebSocketMessageService {
  /** Returns true when the message was delivered to an active connection. */
  sendToConnection(connectionId: string, payload: Record<string, unknown>): Promise<boolean>;
  /** Returns true when the target connection is still open in API Gateway. */
  probeConnection(connectionId: string): Promise<boolean>;
  broadcastToSession(
    desktopConnectionId: string,
    mobileConnectionId: string,
    payload: Record<string, unknown>,
    excludeConnectionId?: string,
  ): Promise<void>;
}
