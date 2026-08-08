import { BarcodeScannedPayload } from '../domain';
import { EDeviceType } from '../enums';

export const WEBSOCKET_HANDLER_SERVICE = 'WEBSOCKET_HANDLER_SERVICE';

export interface IWebSocketHandlerService {
  handleConnect(
    connectionId: string,
    token: string,
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
  handleLeaveSession(connectionId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  handleLeaveSessionByToken(sessionId: string, token: string): Promise<void>;
  handleHeartbeat(connectionId: string): Promise<Record<string, unknown>>;
}

export type { BarcodeScannedPayload };
