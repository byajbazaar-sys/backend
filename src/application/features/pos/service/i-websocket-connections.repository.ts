import { WebSocketConnection } from '../domain';
import { EDeviceType } from '../enums';

export const WEBSOCKET_CONNECTIONS_REPOSITORY = 'WEBSOCKET_CONNECTIONS_REPOSITORY';

export interface IWebSocketConnectionsRepository {
  create(data: WebSocketConnection): Promise<WebSocketConnection>;
  findByConnectionId(connectionId: string): Promise<WebSocketConnection>;
  /**
   * Live connections of a shop. With `area` (whatsapp, marketing …) connections of members without access to it
   * are left out, so their screens never receive those events.
   */
  findActiveByUserId(userId: string, area?: string): Promise<WebSocketConnection[]>;
  findActiveBySessionAndDevice(sessionId: string, deviceType: EDeviceType): Promise<WebSocketConnection>;
  markDisconnected(connectionId: string): Promise<void>;
  updateSessionId(connectionId: string, sessionId: string): Promise<void>;
  updateDeviceType(connectionId: string, deviceType: EDeviceType): Promise<void>;
}
