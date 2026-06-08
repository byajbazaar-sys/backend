import { PosSession } from '../domain';
import { PosSessionQrResponseModel, PosSessionValidateResponseModel } from '../models';

export const POS_SESSION_SERVICE = 'POS_SESSION_SERVICE';

export interface IPosSessionService {
  createSession(userId: string): Promise<PosSessionQrResponseModel>;
  getSession(id: string, userId: string): Promise<PosSession>;
  getQrData(id: string, userId: string): Promise<PosSessionQrResponseModel>;
  validateSessionToken(sessionId: string, token: string): Promise<PosSession>;
  validateSessionForScanner(sessionId: string, token: string): Promise<PosSessionValidateResponseModel>;
  closeSession(id: string, userId: string): Promise<void>;
  attachDesktopConnection(sessionId: string, connectionId: string, userId: string): Promise<PosSession>;
  attachMobileConnection(sessionId: string, connectionId: string, userId: string): Promise<PosSession>;
  isSessionActive(session: PosSession): boolean;
}
