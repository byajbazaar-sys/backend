import { PosSession } from '../domain';
import { EPosSessionStatus } from '../enums';
import { PosSessionPatch } from '../models';

export const POS_SESSIONS_REPOSITORY = 'POS_SESSIONS_REPOSITORY';

export interface IPosSessionsRepository {
  create(data: PosSession): Promise<PosSession>;
  findById(id: string): Promise<PosSession>;
  findBySessionCode(sessionCode: string): Promise<PosSession>;
  update(id: string, data: PosSessionPatch): Promise<PosSession>;
  updateStatus(id: string, status: EPosSessionStatus): Promise<PosSession>;
}
