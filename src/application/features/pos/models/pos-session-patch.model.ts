import { EPosSessionStatus } from '../enums';

export interface PosSessionPatch {
  status?: EPosSessionStatus;
  desktopConnectionId?: string;
  mobileConnectionId?: string;
}
