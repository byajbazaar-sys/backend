import { ShopPermissions, ShopRole } from './shop-permissions';

/** A person's access to a shop they don't own (invited member). Owners are not stored here. */
export interface ShopMembership {
  id: string;
  /** The shop's account (users.id) — all its data is keyed by this id. */
  shopId: string;
  /** The member's own account (users.id), used to sign in. */
  memberUserId: string;
  role: ShopRole;
  /** Per-module overrides on top of the role preset. */
  permissions: Partial<ShopPermissions>;
  status: 'active' | 'disabled';
  invitedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
