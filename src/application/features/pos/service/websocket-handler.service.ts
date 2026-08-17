import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IIdentity, UsersAuthOptions } from '@shared-libs';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { POS_SESSION_SERVICE, IPosSessionService } from './i-pos-session.service';
import { IPosSessionsRepository, POS_SESSIONS_REPOSITORY } from './i-pos-sessions.repository';
import {
  IWebSocketConnectionsRepository,
  WEBSOCKET_CONNECTIONS_REPOSITORY,
} from './i-websocket-connections.repository';
import { IWebSocketMessageService, WEBSOCKET_MESSAGE_SERVICE } from '../../../shared';
import { InventoryItem } from '../../inventory/domain';
import { BARCODE_SERVICE, IBarcodeService } from '../../inventory/service/i-barcode.service';
import {
  IInventoryItemsRepository,
  INVENTORY_ITEMS_REPOSITORY,
} from '../../inventory/service/i-inventory-items.repository';
import { EDeviceType } from '../enums';
import { WebSocketConnectResult } from '../domain';
import { IWebSocketHandlerService } from './i-websocket-handler.service';

@Injectable()
export class WebSocketHandlerService implements IWebSocketHandlerService {
  constructor(
    @Inject(WEBSOCKET_CONNECTIONS_REPOSITORY)
    private readonly connectionsRepo: IWebSocketConnectionsRepository,
    @Inject(POS_SESSIONS_REPOSITORY) private readonly sessionsRepo: IPosSessionsRepository,
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly itemsRepo: IInventoryItemsRepository,
    @Inject(BARCODE_SERVICE) private readonly barcodeService: IBarcodeService,
    @Inject(WEBSOCKET_MESSAGE_SERVICE) private readonly wsMessage: IWebSocketMessageService,
    @Inject(POS_SESSION_SERVICE) private readonly posSessionService: IPosSessionService,
    private readonly jwtService: JwtService,
    protected readonly options: UsersAuthOptions,
    @InjectPinoLogger(WebSocketHandlerService.name) private readonly logger: PinoLogger,
  ) {}

  private verifyUserToken(token: string): IIdentity {
    if (!token) throw new UnauthorizedException('Token required');
    try {
      return this.jwtService.verify(token, {
        secret: this.options.secret,
        audience: this.options.audience,
        issuer: this.options.issuer,
        algorithms: [this.options.algorithm],
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private verifyPosSessionConnectToken(token: string): { userId: string } {
    if (!token) throw new UnauthorizedException('Token required');
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.options.secret,
        audience: this.options.audience,
        issuer: this.options.issuer,
        algorithms: [this.options.algorithm],
      });
      if (payload.type !== 'pos-session' || !payload.userId) {
        throw new UnauthorizedException('Invalid session token');
      }
      return { userId: payload.userId };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid session token');
    }
  }

  async handleConnect(
    connectionId: string,
    token: string,
    deviceType: EDeviceType = EDeviceType.Desktop,
  ): Promise<WebSocketConnectResult> {
    try {
      const resolvedDevice = deviceType === EDeviceType.Mobile ? EDeviceType.Mobile : EDeviceType.Desktop;
      const userId =
        resolvedDevice === EDeviceType.Mobile
          ? this.verifyPosSessionConnectToken(token).userId
          : this.verifyUserToken(token).userId;

      await this.connectionsRepo.create({
        connectionId,
        userId,
        deviceType: resolvedDevice,
      });
      this.logger.info({ connectionId, userId, deviceType: resolvedDevice }, 'WebSocket connected');
      return plainToInstance(WebSocketConnectResult, { statusCode: 200 }, { excludeExtraneousValues: true });
    } catch (err) {
      this.logger.warn(
        {
          connectionId,
          deviceType,
          hasToken: !!token,
          reason: err instanceof Error ? err.message : 'auth failed',
        },
        'WebSocket connect rejected',
      );
      return { statusCode: 401 };
    }
  }

  private async releaseMobileSlot(sessionId: string, previousConnectionId: string): Promise<void> {
    if (!previousConnectionId) return;

    await this.connectionsRepo.markDisconnected(previousConnectionId);
    await this.sessionsRepo.update(sessionId, { mobileConnectionId: undefined });
    this.logger.info({ sessionId, previousConnectionId }, 'Released previous mobile scanner slot');
  }

  private async notifyDesktopScannerDisconnected(sessionId: string, desktopConnectionId: string): Promise<void> {
    if (!desktopConnectionId) return;
    await this.wsMessage.sendToConnection(desktopConnectionId, {
      type: 'scannerDisconnected',
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }

  private async detachMobileScanner(sessionId: string, mobileConnectionId: string): Promise<void> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (session?.mobileConnectionId !== mobileConnectionId) return;

    const desktopId = session.desktopConnectionId;
    await this.releaseMobileSlot(sessionId, mobileConnectionId);
    await this.notifyDesktopScannerDisconnected(sessionId, desktopId);
    this.logger.info({ sessionId, mobileConnectionId }, 'Mobile scanner detached from session');
  }

  private async ensureMobileSlotAvailable(
    sessionId: string,
    connectionId: string,
    previousMobileId: string,
  ): Promise<void> {
    if (!previousMobileId || previousMobileId === connectionId) return;

    const previousConn = await this.connectionsRepo.findByConnectionId(previousMobileId);
    if (previousConn?.disconnectedAt) {
      await this.releaseMobileSlot(sessionId, previousMobileId);
      return;
    }

    const alive = await this.wsMessage.probeConnection(previousMobileId);
    if (!alive) {
      await this.releaseMobileSlot(sessionId, previousMobileId);
      return;
    }

    // Last-connect-wins: notify and replace stale tab that failed to disconnect cleanly
    await this.wsMessage.sendToConnection(previousMobileId, { type: 'sessionReplaced' });
    await this.releaseMobileSlot(sessionId, previousMobileId);
  }

  async handleDisconnect(connectionId: string): Promise<void> {
    await this.connectionsRepo.markDisconnected(connectionId);
    const connection = await this.connectionsRepo.findByConnectionId(connectionId);
    if (connection?.sessionId) {
      const session = await this.sessionsRepo.findById(connection.sessionId);
      if (session) {
        const wasMobile = session.mobileConnectionId === connectionId;
        const desktopId = session.desktopConnectionId;
        const updates: Record<string, string> = {};
        if (session.desktopConnectionId === connectionId) updates.desktopConnectionId = undefined;
        if (wasMobile) updates.mobileConnectionId = undefined;
        if (Object.keys(updates).length) {
          await this.sessionsRepo.update(session.id, updates);
        }

        if (wasMobile && desktopId) {
          await this.notifyDesktopScannerDisconnected(session.id, desktopId);
        }
      }
    }
    this.logger.info({ connectionId }, 'WebSocket disconnected');
  }

  async handleCreateSession(
    connectionId: string,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const deviceType = (body.deviceType as EDeviceType) ?? EDeviceType.Desktop;
    const sessionId = body.sessionId as string;

    if (!sessionId) throw new ForbiddenException('sessionId required');

    await this.connectionsRepo.updateSessionId(connectionId, sessionId);
    await this.connectionsRepo.updateDeviceType(connectionId, deviceType);

    let session = await this.sessionsRepo.findById(sessionId);

    if (deviceType === EDeviceType.Desktop) {
      session = await this.posSessionService.attachDesktopConnection(sessionId, connectionId, userId);

      let mobileConnected = false;
      if (session.mobileConnectionId) {
        const mobileAlive = await this.wsMessage.probeConnection(session.mobileConnectionId);
        if (mobileAlive) {
          mobileConnected = true;
          await this.wsMessage.sendToConnection(session.mobileConnectionId, {
            type: 'desktopConnected',
            sessionId,
            timestamp: new Date().toISOString(),
          });
          await this.wsMessage.sendToConnection(connectionId, {
            type: 'scannerConnected',
            sessionId,
            timestamp: new Date().toISOString(),
          });
          await this.wsMessage.sendToConnection(connectionId, {
            type: 'requestCartSync',
            sessionId,
            timestamp: new Date().toISOString(),
          });
        } else {
          await this.releaseMobileSlot(sessionId, session.mobileConnectionId);
          session = (await this.sessionsRepo.findById(sessionId)) ?? session;
        }
      }

      return {
        type: 'sessionRegistered',
        sessionId,
        status: session?.status,
        deviceType,
        mobileConnected,
      };
    }

    return {
      type: 'sessionRegistered',
      sessionId,
      status: session?.status,
      deviceType,
      mobileConnected: !!session?.mobileConnectionId,
    };
  }

  async handleJoinSession(
    connectionId: string,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const sessionId = body.sessionId as string;
    const token = body.token as string;

    if (!sessionId || !token) throw new ForbiddenException('sessionId and token required');

    const session = await this.posSessionService.validateSessionToken(sessionId, token);
    await this.connectionsRepo.updateSessionId(connectionId, sessionId);
    await this.connectionsRepo.updateDeviceType(connectionId, EDeviceType.Mobile);

    await this.ensureMobileSlotAvailable(sessionId, connectionId, session.mobileConnectionId);

    const existingMobile = await this.connectionsRepo.findActiveBySessionAndDevice(sessionId, EDeviceType.Mobile);
    if (existingMobile?.connectionId !== connectionId) {
      const alive = await this.wsMessage.probeConnection(existingMobile.connectionId);
      if (!alive) {
        await this.connectionsRepo.markDisconnected(existingMobile.connectionId);
      } else {
        await this.wsMessage.sendToConnection(existingMobile.connectionId, { type: 'sessionReplaced' });
        await this.connectionsRepo.markDisconnected(existingMobile.connectionId);
      }
    }

    this.logger.info({ sessionId, connectionId }, 'Mobile joining POS session');

    const updatedSession = await this.posSessionService.attachMobileConnection(
      sessionId,
      connectionId,
      session.createdBy,
    );

    if (updatedSession.desktopConnectionId) {
      await this.wsMessage.sendToConnection(updatedSession.desktopConnectionId, {
        type: 'scannerConnected',
        sessionId,
        timestamp: new Date().toISOString(),
      });
      await this.wsMessage.sendToConnection(updatedSession.desktopConnectionId, {
        type: 'requestCartSync',
        sessionId,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      type: 'sessionJoined',
      sessionId,
      status: 'CONNECTED',
      desktopConnected: !!updatedSession.desktopConnectionId,
    };
  }

  private serializeInventoryItem(item: InventoryItem): Record<string, unknown> {
    return instanceToPlain(item, { excludeExtraneousValues: true }) as Record<string, unknown>;
  }

  /** Match inventory lookup API — barcode, SKU, item code, inventory QR JSON, or item id. */
  private async resolveInventoryFromScan(code: string, ownerUserId: string): Promise<InventoryItem> {
    const raw = code.trim();
    const qrPayload = this.barcodeService.parseInventoryQrPayload(raw);

    if (qrPayload?.inventoryId) {
      const byId = await this.itemsRepo.findById(qrPayload.inventoryId);
      if (byId) {
        if (byId.createdBy !== ownerUserId) {
          throw new ForbiddenException('Item does not belong to session owner');
        }
        return byId;
      }
    }

    const lookupCode = qrPayload?.sku?.trim() || raw;
    const item = await this.itemsRepo.findByScanCode(lookupCode, ownerUserId);
    if (!item) throw new NotFoundException('Inventory item not found for barcode');
    if (item.createdBy !== ownerUserId) throw new ForbiddenException('Item does not belong to session owner');
    return item;
  }

  async handleBarcodeScanned(
    connectionId: string,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const barcode = body.barcode as string;
    const sessionId = body.sessionId as string;

    if (!barcode || !sessionId) throw new ForbiddenException('barcode and sessionId required');

    this.logger.info({ barcode, sessionId, connectionId }, 'Barcode received from mobile');

    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    if (!this.posSessionService.isSessionActive(session)) {
      throw new ForbiddenException('Session is not active');
    }
    if (session.mobileConnectionId !== connectionId) {
      throw new ForbiddenException('Only the attached mobile scanner can send barcodes');
    }
    if (!session.desktopConnectionId) {
      throw new ForbiddenException('Desktop POS is not connected');
    }

    const item = await this.resolveInventoryFromScan(barcode, session.createdBy);
    const itemPayload = this.serializeInventoryItem(item);

    this.logger.info({ sessionId, barcode, itemId: item.id, sku: item.sku }, 'Session validated — emitting to desktop');

    const payload = {
      type: 'barcodeScanned',
      barcode,
      item: itemPayload,
      sessionId,
      timestamp: new Date().toISOString(),
    };

    const delivered = await this.wsMessage.sendToConnection(session.desktopConnectionId, payload);
    if (!delivered) {
      await this.sessionsRepo.update(sessionId, { desktopConnectionId: undefined });
      this.logger.warn({ sessionId, desktopConnectionId: session.desktopConnectionId }, 'Desktop connection stale');
      throw new ForbiddenException('Desktop POS disconnected — refresh the POS page');
    }

    this.logger.info({ sessionId, barcode }, 'Barcode emitted to desktop');

    return { type: 'barcodeAck', barcode, success: true, item: itemPayload };
  }

  async handleCartItemRemoved(
    connectionId: string,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const sessionId = body.sessionId as string;
    const barcode = body.barcode as string;

    if (!sessionId || !barcode) throw new ForbiddenException('sessionId and barcode required');

    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    if (!this.posSessionService.isSessionActive(session)) {
      throw new ForbiddenException('Session is not active');
    }

    let desktopConnectionId = session.desktopConnectionId;
    if (desktopConnectionId !== connectionId) {
      const connection = await this.connectionsRepo.findByConnectionId(connectionId);
      if (connection?.deviceType === EDeviceType.Desktop && session.createdBy === userId) {
        const updated = await this.posSessionService.attachDesktopConnection(sessionId, connectionId, userId);
        desktopConnectionId = updated.desktopConnectionId;
      }
    }

    if (desktopConnectionId !== connectionId) {
      throw new ForbiddenException('Only desktop POS can release barcodes');
    }

    if (session.mobileConnectionId) {
      const payload = {
        type: 'barcodeReleased',
        barcode,
        sessionId,
        timestamp: new Date().toISOString(),
      };
      const delivered = await this.wsMessage.sendToConnection(session.mobileConnectionId, payload);
      this.logger.info({ sessionId, barcode, delivered }, 'Barcode released to mobile');
    }

    return { type: 'cartItemRemovedAck', barcode, success: true };
  }

  private async assertSessionParticipant(
    sessionId: string,
    connectionId: string,
    allowed: 'desktop' | 'mobile' | 'either',
    userId?: string,
  ) {
    let session = await this.sessionsRepo.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    if (!this.posSessionService.isSessionActive(session)) {
      throw new ForbiddenException('Session is not active');
    }

    const connection = await this.connectionsRepo.findByConnectionId(connectionId);
    if (connection?.sessionId && connection.sessionId !== sessionId) {
      throw new ForbiddenException('Connection does not belong to this session');
    }

    if (allowed === 'desktop' && session.desktopConnectionId !== connectionId) {
      if (userId && connection?.deviceType === EDeviceType.Desktop && session.createdBy === userId) {
        session = await this.posSessionService.attachDesktopConnection(sessionId, connectionId, userId);
      } else {
        throw new ForbiddenException('Only desktop POS can perform this action');
      }
    }
    if (allowed === 'mobile' && session.mobileConnectionId !== connectionId) {
      throw new ForbiddenException('Only the paired mobile scanner can perform this action');
    }
    if (
      allowed === 'either' &&
      session.desktopConnectionId !== connectionId &&
      session.mobileConnectionId !== connectionId
    ) {
      throw new ForbiddenException('Connection is not part of this session');
    }

    return session;
  }

  async handleSyncCartState(
    connectionId: string,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const sessionId = body.sessionId as string;
    const barcodes = body.barcodes as string[];
    const entries = body.entries;

    if (!sessionId || !Array.isArray(barcodes)) {
      throw new ForbiddenException('sessionId and barcodes array required');
    }

    const session = await this.assertSessionParticipant(sessionId, connectionId, 'desktop', userId);

    if (session.mobileConnectionId) {
      const payload = {
        type: 'cartStateSync',
        sessionId,
        barcodes,
        entries,
        timestamp: new Date().toISOString(),
      };
      await this.wsMessage.sendToConnection(session.mobileConnectionId, payload);
      this.logger.info({ sessionId, count: barcodes.length }, 'Cart state synced to mobile');
    }

    return { type: 'cartStateSyncAck', success: true, count: barcodes.length };
  }

  async handleCartCleared(
    connectionId: string,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const sessionId = body.sessionId as string;
    if (!sessionId) throw new ForbiddenException('sessionId required');

    const session = await this.assertSessionParticipant(sessionId, connectionId, 'desktop', userId);

    if (session.mobileConnectionId) {
      await this.wsMessage.sendToConnection(session.mobileConnectionId, {
        type: 'cartCleared',
        sessionId,
        timestamp: new Date().toISOString(),
      });
      this.logger.info({ sessionId }, 'Cart cleared notification sent to mobile');
    }

    return { type: 'cartClearedAck', success: true };
  }

  async handleCartUpdated(
    connectionId: string,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const sessionId = body.sessionId as string;
    const cart = body.cart;

    if (!sessionId) throw new ForbiddenException('sessionId required');

    const session = await this.assertSessionParticipant(sessionId, connectionId, 'either');

    const payload = {
      type: 'cartUpdated',
      cart,
      sessionId,
      timestamp: new Date().toISOString(),
    };

    await this.wsMessage.broadcastToSession(
      session.desktopConnectionId,
      session.mobileConnectionId,
      payload,
      connectionId,
    );

    return { type: 'cartUpdatedAck', success: true };
  }

  async handleLeaveSession(connectionId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sessionId = body.sessionId as string;
    if (!sessionId) throw new ForbiddenException('sessionId required');

    const session = await this.sessionsRepo.findById(sessionId);
    if (session?.mobileConnectionId === connectionId) {
      await this.detachMobileScanner(sessionId, connectionId);
    }

    return { type: 'leaveSessionAck', sessionId, success: true };
  }

  async handleLeaveSessionByToken(sessionId: string, token: string): Promise<void> {
    await this.posSessionService.validateSessionToken(sessionId, token);
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session?.mobileConnectionId) return;
    await this.detachMobileScanner(sessionId, session.mobileConnectionId);
  }

  async handleHeartbeat(connectionId: string): Promise<Record<string, unknown>> {
    return { type: 'heartbeatAck', connectionId, timestamp: new Date().toISOString() };
  }
}
