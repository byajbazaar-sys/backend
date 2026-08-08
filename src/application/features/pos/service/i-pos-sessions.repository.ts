import { PosSession } from '../domain';
import { PosSessionPatch } from '../models';
import { EPosSessionStatus } from '../enums';

export const POS_SESSIONS_REPOSITORY = 'POS_SESSIONS_REPOSITORY';

export interface IPosSessionsRepository {
  create(data: PosSession): Promise<PosSession>;
  findById(id: string): Promise<PosSession>;
  findBySessionCode(sessionCode: string): Promise<PosSession>;
  update(id: string, data: PosSessionPatch): Promise<PosSession>;
  updateStatus(id: string, status: EPosSessionStatus): Promise<PosSession>;
}
