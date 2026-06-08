import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { IIdentity, UsersAuthOptions } from '@shared-libs';
import {
  IInventoryItemsRepository,
  INVENTORY_ITEMS_REPOSITORY,
  IPosSessionsRepository,
  POS_SESSIONS_REPOSITORY,
  IWebSocketConnectionsRepository,
  WEBSOCKET_CONNECTIONS_REPOSITORY,
} from '../../../shared';
import { WEBSOCKET_MESSAGE_SERVICE, IWebSocketMessageService } from '../../../../infrastructure/websocket/i-websocket-message.service';
import { EDeviceType } from '../enums';
import { IWebSocketHandlerService } from './i-websocket-handler.service';
import { POS_SESSION_SERVICE, IPosSessionService } from './i-pos-session.service';

@Injectable()
export class WebSocketHandlerService implements IWebSocketHandlerService {
  constructor(
    @Inject(WEBSOCKET_CONNECTIONS_REPOSITORY)
    private readonly connectionsRepo: IWebSocketConnectionsRepository,
    @Inject(POS_SESSIONS_REPOSITORY) private readonly sessionsRepo: IPosSessionsRepository,
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly itemsRepo: IInventoryItemsRepository,
    @Inject(WEBSOCKET_MESSAGE_SERVICE) private readonly wsMessage: IWebSocketMessageService,
    @Inject(POS_SESSION_SERVICE) private readonly posSessionService: IPosSessionService,
    private readonly jwtService: JwtService,
    protected readonly options: UsersAuthOptions,
    @InjectPinoLogger(WebSocketHandlerService.name) private readonly logger: PinoLogger,
  ) {}

  private verifyUserToken(token: string | undefined): IIdentity {
    if (!token) throw new UnauthorizedException('Token required');
    try {
      return this.jwtService.verify(token, {
        secret: this.options.secret,
        audience: this.options.audience,
        issuer: this.options.issuer,
        algorithms: [this.options.algorithm],
      }) as IIdentity;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private verifyPosSessionConnectToken(token: string | undefined): { userId: string } {
    if (!token) throw new UnauthorizedException('Token required');
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.options.secret,
        audience: this.options.audience,
        issuer: this.options.issuer,
        algorithms: [this.options.algorithm],
      }) as { userId: string; type: string };
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
    token: string | undefined,
    deviceType: EDeviceType = EDeviceType.Desktop,
  ): Promise<{ statusCode: number }> {
    try {
      const resolvedDevice =
        deviceType === EDeviceType.Mobile ? EDeviceType.Mobile : EDeviceType.Desktop;
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
      return { statusCode: 200 };
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

  private async releaseMobileSlot(sessionId: string, previousConnectionId: string | undefined): Promise<void> {
    if (!previousConnectionId) return;

    await this.connectionsRepo.markDisconnected(previousConnectionId);
    await this.sessionsRepo.update(sessionId, { mobileConnectionId: undefined });
    this.logger.info({ sessionId, previousConnectionId }, 'Released previous mobile scanner slot');
  }

  private async ensureMobileSlotAvailable(
    sessionId: string,
    connectionId: string,
    previousMobileId: string | undefined,
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
        const updates: Record<string, string | undefined> = {};
        if (session.desktopConnectionId === connectionId) updates.desktopConnectionId = undefined;
        if (wasMobile) updates.mobileConnectionId = undefined;
        if (Object.keys(updates).length) {
          await this.sessionsRepo.update(session.id, updates);
        }

        if (wasMobile && desktopId) {
          await this.wsMessage.sendToConnection(desktopId, {
            type: 'scannerDisconnected',
            sessionId: session.id,
            timestamp: new Date().toISOString(),
          });
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
    const sessionId = body.sessionId as string | undefined;

    if (!sessionId) throw new ForbiddenException('sessionId required');

    await this.connectionsRepo.updateSessionId(connectionId, sessionId);
    await this.connectionsRepo.updateDeviceType(connectionId, deviceType);

    let session = await this.sessionsRepo.findById(sessionId);

    if (deviceType === EDeviceType.Desktop) {
      session = await this.posSessionService.attachDesktopConnection(sessionId, connectionId, userId);

      if (session.mobileConnectionId) {
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
      }
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

    const existingMobile = await this.connectionsRepo.findActiveBySessionAndDevice(
      sessionId,
      EDeviceType.Mobile,
    );
    if (existingMobile && existingMobile.connectionId !== connectionId) {
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
    }

    return {
      type: 'sessionJoined',
      sessionId,
      status: 'CONNECTED',
      desktopConnected: !!updatedSession.desktopConnectionId,
    };
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

    const item = await this.itemsRepo.findByBarcode(barcode);
    if (!item) throw new NotFoundException('Inventory item not found for barcode');
    if (item.createdBy !== session.createdBy) throw new ForbiddenException('Item does not belong to session owner');

    this.logger.info({ sessionId, barcode, itemId: item.id, sku: item.sku }, 'Session validated — emitting to desktop');

    const payload = {
      type: 'barcodeScanned',
      barcode,
      item,
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

    return { type: 'barcodeAck', barcode, success: true, item };
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
    if (session.desktopConnectionId !== connectionId) {
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

  async handleCartUpdated(
    connectionId: string,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const sessionId = body.sessionId as string;
    const cart = body.cart;

    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');

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

  async handleHeartbeat(connectionId: string): Promise<Record<string, unknown>> {
    return { type: 'heartbeatAck', connectionId, timestamp: new Date().toISOString() };
  }
}
