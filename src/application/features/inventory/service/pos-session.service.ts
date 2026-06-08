import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { UsersAuthOptions } from '@shared-libs';
import {
  IPosSessionsRepository,
  POS_SESSIONS_REPOSITORY,
} from '../../../shared';
import { PosSession } from '../domain';
import { PosSessionQrResponseModel, PosSessionValidateResponseModel } from '../models';
import { EPosSessionStatus } from '../enums';
import { IPosSessionService } from './i-pos-session.service';

const SESSION_TTL_MINUTES = 30;

@Injectable()
export class PosSessionService implements IPosSessionService {
  constructor(
    @Inject(POS_SESSIONS_REPOSITORY) private readonly sessionsRepo: IPosSessionsRepository,
    private readonly jwtService: JwtService,
    protected readonly options: UsersAuthOptions,
    @InjectPinoLogger(PosSessionService.name) private readonly logger: PinoLogger,
  ) {}

  private signSessionToken(payload: { sessionId: string; userId: string; type: string }): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.options.secret,
      audience: this.options.audience,
      issuer: this.options.issuer,
      expiresIn: `${SESSION_TTL_MINUTES}m`,
      algorithm: this.options.algorithm,
    });
  }

  private verifySessionToken(token: string): { sessionId: string; userId: string; type: string } {
    return this.jwtService.verify(token, {
      secret: this.options.secret,
      audience: this.options.audience,
      issuer: this.options.issuer,
      algorithms: [this.options.algorithm],
    }) as { sessionId: string; userId: string; type: string };
  }

  private getWebsocketUrl(): string {
    const url = process.env.WEBSOCKET_API_URL?.trim();
    if (!url) return 'wss://localhost:3001';
    return url.replace(/\/$/, '');
  }

  private async buildQrResponse(session: PosSession, userId: string): Promise<PosSessionQrResponseModel> {
    const expiresAt = session.expiresAt;
    const token = await this.signSessionToken({
      sessionId: session.id,
      userId,
      type: 'pos-session',
    });

    const webAppDomain = process.env.WEB_APP_DOMAIN ?? 'http://localhost:3000';
    const scannerUrl = `${webAppDomain}/scanner?sessionId=${session.id}&token=${encodeURIComponent(token)}&websocketUrl=${encodeURIComponent(this.getWebsocketUrl())}`;
    const qrPayload = scannerUrl;

    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, { width: 280, margin: 2 });

    return {
      sessionId: session.id,
      sessionCode: session.sessionCode,
      expiresAt,
      token,
      qrCodeDataUrl,
      websocketUrl: this.getWebsocketUrl(),
    };
  }

  async createSession(userId: string): Promise<PosSessionQrResponseModel> {
    const sessionCode = randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);

    const session = await this.sessionsRepo.create({
      sessionCode,
      status: EPosSessionStatus.Created,
      expiresAt,
      createdBy: userId,
    });

    this.logger.info({ sessionId: session.id }, 'POS session created');
    return this.buildQrResponse(session, userId);
  }

  async getSession(id: string, userId: string): Promise<PosSession> {
    const session = await this.sessionsRepo.findById(id);
    if (!session) throw new NotFoundException('Session not found');
    if (session.createdBy !== userId) throw new ForbiddenException('Access denied');
    return session;
  }

  async getQrData(id: string, userId: string): Promise<PosSessionQrResponseModel> {
    const session = await this.getSession(id, userId);
    if (!this.isSessionActive(session)) {
      throw new ForbiddenException('Session has expired');
    }
    return this.buildQrResponse(session, userId);
  }

  async validateSessionForScanner(
    sessionId: string,
    token: string,
  ): Promise<PosSessionValidateResponseModel> {
    const session = await this.validateSessionToken(sessionId, token);
    return {
      valid: true,
      sessionId: session.id,
      status: session.status,
      expiresAt: session.expiresAt,
      websocketUrl: this.getWebsocketUrl(),
    };
  }

  async validateSessionToken(sessionId: string, token: string): Promise<PosSession> {
    try {
      const payload = this.verifySessionToken(token);
      if (payload.type !== 'pos-session' || payload.sessionId !== sessionId) {
        throw new UnauthorizedException('Invalid session token');
      }
      const session = await this.sessionsRepo.findById(sessionId);
      if (!session) throw new NotFoundException('Session not found');
      if (!this.isSessionActive(session)) {
        await this.sessionsRepo.updateStatus(sessionId, EPosSessionStatus.Expired);
        throw new ForbiddenException('Session has expired');
      }
      return session;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ForbiddenException) throw err;
      throw new UnauthorizedException('Invalid or expired session token');
    }
  }

  isSessionActive(session: PosSession): boolean {
    return (
      session.status !== EPosSessionStatus.Closed &&
      session.status !== EPosSessionStatus.Expired &&
      new Date(session.expiresAt) > new Date()
    );
  }

  async closeSession(id: string, userId: string): Promise<void> {
    await this.getSession(id, userId);
    await this.sessionsRepo.updateStatus(id, EPosSessionStatus.Closed);
  }

  async attachDesktopConnection(sessionId: string, connectionId: string, userId: string): Promise<PosSession> {
    const session = await this.getSession(sessionId, userId);
    if (!this.isSessionActive(session)) throw new ForbiddenException('Session is not active');
    return this.sessionsRepo.update(sessionId, {
      desktopConnectionId: connectionId,
      status: session.mobileConnectionId ? EPosSessionStatus.Connected : EPosSessionStatus.Created,
    });
  }

  async attachMobileConnection(sessionId: string, connectionId: string, userId: string): Promise<PosSession> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    if (!this.isSessionActive(session)) throw new ForbiddenException('Session is not active');

    return this.sessionsRepo.update(sessionId, {
      mobileConnectionId: connectionId,
      status: EPosSessionStatus.Connected,
    });
  }
}
