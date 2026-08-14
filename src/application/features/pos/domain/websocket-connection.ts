import { Expose } from 'class-transformer';

import { EDeviceType } from '../enums';

export class WebSocketConnection {
  @Expose()
  id?: string;

  @Expose()
  connectionId: string;

  @Expose()
  sessionId?: string;

  @Expose()
  userId: string;

  @Expose()
  deviceType: EDeviceType;

  @Expose()
  connectedAt?: Date;

  @Expose()
  disconnectedAt?: Date;
}
