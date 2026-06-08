import { WebSocketConnection } from '../../features/inventory/domain';
import { EDeviceType } from '../../features/inventory/enums';

export const WEBSOCKET_CONNECTIONS_REPOSITORY = 'WEBSOCKET_CONNECTIONS_REPOSITORY';

export interface IWebSocketConnectionsRepository {
  create(data: WebSocketConnection): Promise<WebSocketConnection>;
  findByConnectionId(connectionId: string): Promise<WebSocketConnection | null>;
  findActiveBySessionAndDevice(sessionId: string, deviceType: EDeviceType): Promise<WebSocketConnection | null>;
  markDisconnected(connectionId: string): Promise<void>;
  updateSessionId(connectionId: string, sessionId: string): Promise<void>;
  updateDeviceType(connectionId: string, deviceType: EDeviceType): Promise<void>;
}
