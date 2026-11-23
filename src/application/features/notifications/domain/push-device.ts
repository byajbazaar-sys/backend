import { Expose } from 'class-transformer';

/** A phone of a business owner that receives push notifications (Expo push token of the ByajBazaar app). */
export class PushDevice {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  @Expose()
  token: string;

  @Expose()
  platform: string | null;

  @Expose()
  lastSeenAt: Date;
}
