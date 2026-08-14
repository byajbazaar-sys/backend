import { Expose } from 'class-transformer';

import { EPosSessionStatus } from '../enums';

export class PosSession {
  @Expose()
  id?: string;

  @Expose()
  sessionCode?: string;

  @Expose()
  status?: EPosSessionStatus;

  @Expose()
  expiresAt?: Date;

  @Expose()
  desktopConnectionId?: string;

  @Expose()
  mobileConnectionId?: string;

  @Expose()
  createdBy?: string;

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;
}
