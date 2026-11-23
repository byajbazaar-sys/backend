import { ShopPermissions, ShopRole } from './shop-permissions';

/** An invitation to join a shop, sent to an email address. Accepted once, by that email's account. */
export interface ShopInvite {
  id: string;
  shopId: string;
  email: string;
  role: ShopRole;
  permissions: Partial<ShopPermissions>;
  /** SHA-256 of the token in the invite link (the token itself is never stored). */
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt?: Date | null;
  acceptedBy?: string | null;
  revokedAt?: Date | null;
  createdAt?: Date;
}
