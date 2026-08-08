import { Expose } from 'class-transformer';

export class SubscriptionUserProfileData {
  @Expose()
  email: string;

  @Expose()
  name: string;

  @Expose()
  phone?: string;
}
