import { PosSession } from '../domain';
import { EPosSessionStatus } from '../enums';

export const POS_SESSIONS_REPOSITORY = 'POS_SESSIONS_REPOSITORY';

export interface IPosSessionsRepository {
  create(data: PosSession): Promise<PosSession>;
  findById(id: string): Promise<PosSession | null>;
  findBySessionCode(sessionCode: string): Promise<PosSession | null>;
  update(id: string, data: Partial<PosSession>): Promise<PosSession>;
  updateStatus(id: string, status: EPosSessionStatus): Promise<PosSession>;
}
