import { EUserType } from './e-user.type';

export type AuthScope = 'full' | 'payment';

export interface IIdentity {
  /**
   * The shop (business account) the request works on — every feature keys its data by this id. For a person in
   * their own shop it is their own account id; in a shop they were invited to (X-Shop-Id) it is that shop's id.
   */
  userId: string;
  userType: EUserType;
  email?: string;
  emailVerified?: boolean;
  /** full = app access; payment = subscription checkout only */
  scope?: AuthScope;
  /** The signed-in person (their own account id). Equals userId when they work in their own shop. */
  actorUserId?: string;
  /** Their role in the shop (owner, manager, staff, viewer, whatsapp, custom). */
  shopRole?: string;
  /** Their access per module in this shop ('none' | 'view' | 'edit'). */
  shopPermissions?: Record<string, string>;
}
