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

  /** The signed-in person (userId is the shop the connection listens to). */
  @Expose()
  actorUserId?: string | null;

  /** Invited members: their access in the shop when they connected (null = owner, everything). */
  @Expose()
  shopPermissions?: Record<string, string> | null;

  @Expose()
  connectedAt?: Date;

  @Expose()
  disconnectedAt?: Date;
}
