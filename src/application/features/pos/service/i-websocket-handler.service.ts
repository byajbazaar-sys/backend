import { BarcodeScannedPayload } from '../domain';
import { EDeviceType } from '../enums';

export const WEBSOCKET_HANDLER_SERVICE = 'WEBSOCKET_HANDLER_SERVICE';

export interface IWebSocketHandlerService {
  handleConnect(
    connectionId: string,
    token: string | undefined,
    deviceType?: EDeviceType,
  ): Promise<{ statusCode: number }>;
  handleDisconnect(connectionId: string): Promise<void>;
  handleCreateSession(connectionId: string, userId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  handleJoinSession(connectionId: string, userId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  handleBarcodeScanned(connectionId: string, userId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  handleCartUpdated(connectionId: string, userId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  handleCartItemRemoved(connectionId: string, userId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  handleSyncCartState(connectionId: string, userId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  handleCartCleared(connectionId: string, userId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  handleHeartbeat(connectionId: string): Promise<Record<string, unknown>>;
}

export type { BarcodeScannedPayload };
