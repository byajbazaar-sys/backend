import { EPosSessionStatus } from '../enums';

export interface PosSessionPatch {
  status?: EPosSessionStatus;
  desktopConnectionId?: string | null;
  mobileConnectionId?: string | null;
}
