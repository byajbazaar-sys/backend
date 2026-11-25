import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { IShopInvitesRepository, SHOP_INVITES_REPOSITORY } from './i-shop-invites.repository';
import { IShopMembershipsRepository, SHOP_MEMBERSHIPS_REPOSITORY } from './i-shop-memberships.repository';
import { ShopAccess, ShopAccessService } from './shop-access.service';
import { EMAIL_SERVICE, IEmailService, IUsersFileStorage, USERS_FILE_STORAGE, WebAppOptions } from '../../../shared';
import { EMAIL_TEMPLATE_SERVICE, IEmailTemplateService } from '../../notifications';
import {
  IWebSocketConnectionsRepository,
  WEBSOCKET_CONNECTIONS_REPOSITORY,
} from '../../pos/service/i-websocket-connections.repository';
import { User } from '../../users/domain/user';
import { IUsersRepository, USERS_REPOSITORY } from '../../users/service/i-users.repository';
import { resolveCatalogSlugForBusinessName } from '../../users/utils/catalog-slug.helper';
import {
  AssignableRole,
  ShopInvite,
  ShopMembership,
  ShopPermissions,
  ShopRole,
  effectivePermissions,
  sanitizePermissions,
} from '../domain';

const INVITE_DAYS = 7;
const MAX_OWNED_SHOPS = 10;
const MAX_MEMBERS = 50;
/** Extra shop accounts get a placeholder address nobody can sign in with (email is required and unique). */
const SHOP_EMAIL_DOMAIN = 'shops.byajbazaar.invalid';

export const ROLE_LABELS: Record<ShopRole, string> = {
  owner: 'Owner',
  manager: 'Superuser',
  staff: 'Staff',
  viewer: 'Read only',
  whatsapp: 'WhatsApp only',
  custom: 'Custom',
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const normEmail = (email: string) => email.trim().toLowerCase();
const personName = (u?: User | null) =>
  [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || u?.email || 'Someone';

export interface ShopSummary {
  id: string;
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  role: ShopRole;
  permissions: ShopPermissions;
  /** primary: the person's own account · owned: an extra shop they created · member: invited into it. */
  kind: 'primary' | 'owned' | 'member';
  /** Has a business name (a staff member's own, never-used account has none). */
  isSetUp: boolean;
}

export interface ShopMemberView {
  /** Membership id (null for the owner, who has no membership). */
  id: string | null;
  userId: string;
  name: string;
  email: string;
  role: ShopRole;
  permissions: ShopPermissions;
  /** Per-module changes on top of the role preset. */
  overrides: Partial<ShopPermissions>;
  status: 'active' | 'disabled';
  joinedAt?: Date;
  isYou: boolean;
}

export interface ShopInviteView {
  id: string;
  email: string;
  role: ShopRole;
  permissions: ShopPermissions;
  status: 'pending' | 'expired';
  expiresAt: Date;
  createdAt?: Date;
  invitedByName: string;
}

export interface PublicInviteView {
  shopName: string;
  shopLogoUrl?: string | null;
  inviterName: string;
  email: string;
  role: ShopRole;
  roleLabel: string;
  status: 'pending' | 'expired' | 'accepted' | 'revoked';
}

/** Several shops per person, and invited members with roles. See ShopAccessService for how requests use them. */
@Injectable()
export class ShopsService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: IUsersRepository,
    @Inject(SHOP_MEMBERSHIPS_REPOSITORY) private readonly memberships: IShopMembershipsRepository,
    @Inject(SHOP_INVITES_REPOSITORY) private readonly invites: IShopInvitesRepository,
    @Inject(USERS_FILE_STORAGE) private readonly fileStorage: IUsersFileStorage,
    @Inject(EMAIL_SERVICE) private readonly email: IEmailService,
    @Inject(EMAIL_TEMPLATE_SERVICE) private readonly templates: IEmailTemplateService,
    private readonly webApp: WebAppOptions,
    private readonly access: ShopAccessService,
    @Inject(WEBSOCKET_CONNECTIONS_REPOSITORY) private readonly connections: IWebSocketConnectionsRepository,
    @InjectPinoLogger(ShopsService.name) private readonly logger: PinoLogger,
  ) {}

  // ------------------------------------------------------------------ shops

  /** Every shop the person can work in: their own, the extra ones they created, and the ones they were invited to. */
  async listShops(actorUserId: string): Promise<ShopSummary[]> {
    const me = await this.users.findById(actorUserId);
    if (!me) throw new NotFoundException('Account not found');
    const owned = me.ownerUserId ? [] : await this.users.listByOwner(actorUserId);
    const memberships = (await this.memberships.listForMember(actorUserId)).filter((m) => m.status === 'active');
    const memberShops = await Promise.all(
      memberships.map(async (m) => ({ m, shop: await this.users.findById(m.shopId) })),
    );

    const list: ShopSummary[] = [await this.summary(me, 'primary', 'owner')];
    for (const shop of owned) list.push(await this.summary(shop, 'owned', 'owner'));
    for (const { m, shop } of memberShops) {
      if (shop && !shop.deletedAt) list.push(await this.summary(shop, 'member', m.role, m.permissions));
    }
    return list;
  }

  /** Adds another shop for this person (its own customers, stock, catalog …; covered by the owner's plan). */
  async createShop(
    actorUserId: string,
    input: { businessName: string; address?: string; state?: string },
  ): Promise<ShopSummary> {
    const me = await this.users.findById(actorUserId);
    if (!me) throw new NotFoundException('Account not found');
    if (me.ownerUserId) throw new ForbiddenException('Only a shop owner can add shops.');
    const name = input.businessName?.trim();
    if (!name) throw new BadRequestException('Enter the shop name.');
    if ((await this.users.listByOwner(actorUserId)).length >= MAX_OWNED_SHOPS) {
      throw new BadRequestException(`You can have up to ${MAX_OWNED_SHOPS + 1} shops.`);
    }
    const catalogSlug = await resolveCatalogSlugForBusinessName(this.users, name);
    const shop = await this.users.create({
      email: `shop-${randomUUID()}@${SHOP_EMAIL_DOMAIN}`,
      firstName: me.firstName,
      lastName: me.lastName,
      businessName: name,
      address: input.address?.trim() || undefined,
      state: input.state?.trim() || undefined,
      catalogSlug: catalogSlug ?? undefined,
      ownerUserId: actorUserId,
      isEmailVerified: false,
      phoneVerificationRequired: false,
      isFirstLogin: false,
    });
    this.logger.info({ actorUserId, shopId: shop.id }, 'Shop added');
    return this.summary(shop, 'owned', 'owner');
  }

  // ------------------------------------------------------------------ members

  async listMembers(actorUserId: string, shopId: string): Promise<ShopMemberView[]> {
    await this.requireTeam(actorUserId, shopId, 'view');
    const shop = await this.requireShop(shopId);
    const ownerId = shop.ownerUserId ?? shop.id;
    const owner = await this.users.findById(ownerId);
    const list: ShopMemberView[] = [
      {
        id: null,
        userId: ownerId,
        name: personName(owner),
        email: owner?.email ?? '',
        role: 'owner',
        permissions: effectivePermissions('owner'),
        overrides: {},
        status: 'active',
        isYou: ownerId === actorUserId,
      },
    ];
    for (const m of await this.memberships.listForShop(shopId)) {
      const person = await this.users.findById(m.memberUserId);
      // The member deleted their account: nothing to manage (their membership is removed with the account).
      if (!person) continue;
      list.push({
        id: m.id,
        userId: m.memberUserId,
        name: personName(person),
        email: person?.email ?? '',
        role: m.role,
        permissions: effectivePermissions(m.role, m.permissions),
        overrides: m.permissions,
        status: m.status,
        joinedAt: m.createdAt,
        isYou: m.memberUserId === actorUserId,
      });
    }
    return list;
  }

  async updateMember(
    actorUserId: string,
    shopId: string,
    membershipId: string,
    patch: { role?: AssignableRole; permissions?: Partial<ShopPermissions>; status?: 'active' | 'disabled' },
  ): Promise<ShopMemberView[]> {
    const me = await this.requireTeam(actorUserId, shopId, 'edit');
    const membership = await this.memberships.findById(membershipId);
    if (membership?.shopId !== shopId) throw new NotFoundException('Member not found');
    if (membership.memberUserId === actorUserId) throw new BadRequestException('You cannot change your own access.');
    this.assertCanManage(me, membership.role, patch.role);
    const roleChanged = !!patch.role && patch.role !== membership.role;
    await this.memberships.update(membershipId, {
      ...(patch.role ? { role: patch.role } : {}),
      // A new role starts from its own preset: old per-module overrides (e.g. edit access from a custom role) must
      // not carry over to a narrower role such as "Read only".
      ...(patch.permissions
        ? { permissions: sanitizePermissions(patch.permissions) }
        : roleChanged
          ? { permissions: {} }
          : {}),
      ...(patch.status ? { status: patch.status } : {}),
    });
    await this.afterAccessChanged(shopId, membership.memberUserId);
    return this.listMembers(actorUserId, shopId);
  }

  async removeMember(actorUserId: string, shopId: string, membershipId: string): Promise<void> {
    const membership = await this.memberships.findById(membershipId);
    if (membership?.shopId !== shopId) throw new NotFoundException('Member not found');
    // Anyone may leave a shop; removing others needs team access.
    if (membership.memberUserId !== actorUserId) {
      const me = await this.requireTeam(actorUserId, shopId, 'edit');
      this.assertCanManage(me, membership.role);
    }
    await this.memberships.delete(membershipId);
    await this.afterAccessChanged(shopId, membership.memberUserId);
  }

  // ------------------------------------------------------------------ invites

  async listInvites(actorUserId: string, shopId: string): Promise<ShopInviteView[]> {
    await this.requireTeam(actorUserId, shopId, 'view');
    const open = await this.invites.listOpenForShop(shopId);
    return Promise.all(open.map((invite) => this.inviteView(invite)));
  }

  /** Invites an email address into the shop; returns the invite and its link (to share on WhatsApp too). */
  async createInvite(
    actorUserId: string,
    shopId: string,
    input: { email: string; role: AssignableRole; permissions?: Partial<ShopPermissions> },
  ): Promise<{ invite: ShopInviteView; inviteUrl: string; emailSent: boolean }> {
    const me = await this.requireTeam(actorUserId, shopId, 'edit');
    this.assertCanManage(me, undefined, input.role);
    const shop = await this.requireShop(shopId);
    const email = normEmail(input.email ?? '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith(`@${SHOP_EMAIL_DOMAIN}`)) {
      throw new BadRequestException('Enter a valid email address.');
    }

    const ownerId = shop.ownerUserId ?? shop.id;
    const owner = ownerId === shop.id ? shop : await this.users.findById(ownerId);
    if (owner?.email && normEmail(owner.email) === email) throw new ConflictException('That is the shop owner.');
    const existingUser = await this.users.findByEmail(email);
    if (existingUser) {
      const membership = await this.memberships.find(shopId, existingUser.id);
      if (membership?.status === 'active') throw new ConflictException('This person is already a member of the shop.');
    }
    await this.assertMemberCapacity(shopId, existingUser?.id);
    // One open invite per email: a new one replaces the old link.
    for (const open of await this.invites.listOpenForShop(shopId)) {
      if (normEmail(open.email) === email) await this.invites.update(open.id, { revokedAt: new Date() });
    }

    const token = randomBytes(24).toString('base64url');
    const invite = await this.invites.create({
      shopId,
      email,
      role: input.role,
      permissions: sanitizePermissions(input.permissions),
      tokenHash: hashToken(token),
      invitedBy: actorUserId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      acceptedAt: null,
      acceptedBy: null,
      revokedAt: null,
    });
    const inviteUrl = this.webApp.buildShopInviteUrl(token);
    const emailSent = await this.sendInviteEmail(invite, inviteUrl, shop, actorUserId);
    return { invite: await this.inviteView(invite), inviteUrl, emailSent };
  }

  /** A fresh link (and email) for an open invite; the old link stops working. */
  async resendInvite(
    actorUserId: string,
    shopId: string,
    inviteId: string,
  ): Promise<{ invite: ShopInviteView; inviteUrl: string; emailSent: boolean }> {
    const me = await this.requireTeam(actorUserId, shopId, 'edit');
    const invite = await this.invites.findById(inviteId);
    if (invite?.shopId !== shopId || invite.acceptedAt || invite.revokedAt) {
      throw new NotFoundException('Invite not found');
    }
    this.assertCanManage(me, invite.role);
    const token = randomBytes(24).toString('base64url');
    const updated = await this.invites.update(inviteId, {
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    });
    const inviteUrl = this.webApp.buildShopInviteUrl(token);
    const emailSent = await this.sendInviteEmail(updated, inviteUrl, await this.requireShop(shopId), actorUserId);
    return { invite: await this.inviteView(updated), inviteUrl, emailSent };
  }

  async revokeInvite(actorUserId: string, shopId: string, inviteId: string): Promise<void> {
    const me = await this.requireTeam(actorUserId, shopId, 'edit');
    const invite = await this.invites.findById(inviteId);
    if (invite?.shopId !== shopId) throw new NotFoundException('Invite not found');
    this.assertCanManage(me, invite.role);
    if (!invite.acceptedAt && !invite.revokedAt) await this.invites.update(inviteId, { revokedAt: new Date() });
  }

  /** What the invite page shows before signing in (no secrets: the token is the proof). */
  async publicInvite(token: string): Promise<PublicInviteView> {
    const invite = await this.invites.findByTokenHash(hashToken(token));
    if (!invite) throw new NotFoundException('This invite link is not valid.');
    const shop = await this.users.findById(invite.shopId);
    if (!shop || shop.deletedAt) throw new NotFoundException('This shop no longer exists.');
    const inviter = await this.users.findById(invite.invitedBy);
    return {
      shopName: shop.businessName?.trim() || 'a shop',
      shopLogoUrl: await this.logoUrl(shop),
      inviterName: personName(inviter),
      email: invite.email,
      role: invite.role,
      roleLabel: ROLE_LABELS[invite.role] ?? invite.role,
      status: invite.revokedAt
        ? 'revoked'
        : invite.acceptedAt
          ? 'accepted'
          : invite.expiresAt.getTime() < Date.now()
            ? 'expired'
            : 'pending',
    };
  }

  /** Joins the shop: the signed-in account's email must be the invited one. */
  async acceptInvite(actorUserId: string, token: string): Promise<ShopSummary> {
    const invite = await this.invites.findByTokenHash(hashToken(token));
    if (!invite || invite.revokedAt) throw new NotFoundException('This invite link is not valid any more.');
    const me = await this.users.findById(actorUserId);
    if (!me) throw new NotFoundException('Account not found');
    const shop = await this.requireShop(invite.shopId);

    if (invite.acceptedAt) {
      if (invite.acceptedBy === actorUserId) return this.summaryFor(actorUserId, shop);
      throw new GoneException('This invite has already been used.');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new GoneException('This invite has expired. Ask the shop owner to send a new one.');
    }
    if (!me.email || normEmail(me.email) !== normEmail(invite.email)) {
      throw new ForbiddenException(`This invite is for ${invite.email}. Sign in with that email to accept it.`);
    }
    if (shop.id === actorUserId || shop.ownerUserId === actorUserId) {
      throw new ConflictException('You already own this shop.');
    }
    // Several invites can be open at once: the limit is checked again when one is used.
    await this.assertMemberCapacity(shop.id, actorUserId);

    await this.memberships.upsert({
      shopId: shop.id,
      memberUserId: actorUserId,
      role: invite.role,
      permissions: invite.permissions,
      status: 'active',
      invitedBy: invite.invitedBy,
    });
    await this.invites.update(invite.id, { acceptedAt: new Date(), acceptedBy: actorUserId });
    this.access.forget(shop.id, actorUserId);
    this.logger.info({ shopId: shop.id, memberUserId: actorUserId, role: invite.role }, 'Shop invite accepted');
    return this.summaryFor(actorUserId, shop);
  }

  // ------------------------------------------------------------------ helpers

  private async summaryFor(actorUserId: string, shop: User): Promise<ShopSummary> {
    const m = await this.memberships.find(shop.id, actorUserId);
    return this.summary(shop, 'member', m?.role ?? 'viewer', m?.permissions);
  }

  private async summary(
    shop: User,
    kind: ShopSummary['kind'],
    role: ShopRole,
    overrides?: Partial<ShopPermissions>,
  ): Promise<ShopSummary> {
    return {
      id: shop.id,
      name: shop.businessName?.trim() || (kind === 'primary' ? 'My shop' : 'Shop'),
      logoUrl: await this.logoUrl(shop),
      address: shop.address ?? null,
      role,
      permissions: effectivePermissions(role, overrides),
      kind,
      isSetUp: !!shop.businessName?.trim(),
    };
  }

  private async logoUrl(shop: User): Promise<string | null> {
    if (!shop.shopLogoRef) return null;
    if (/^https?:\/\//.test(shop.shopLogoRef)) return shop.shopLogoRef;
    try {
      return (await this.fileStorage.getUrlAsync(shop.shopLogoRef)) ?? null;
    } catch {
      return null;
    }
  }

  private async requireShop(shopId: string): Promise<User> {
    const shop = await this.users.findById(shopId);
    if (!shop || shop.deletedAt) throw new NotFoundException('Shop not found');
    return shop;
  }

  /** The person's access to the shop, when it includes the team at `need` level. */
  private async requireTeam(actorUserId: string, shopId: string, need: 'view' | 'edit'): Promise<ShopAccess> {
    const access = await this.access.accessFor(actorUserId, shopId);
    const level = access?.permissions.team ?? 'none';
    if (!access || level === 'none' || (need === 'edit' && level !== 'edit')) {
      throw new ForbiddenException('Only the shop owner or a superuser can manage members.');
    }
    return access;
  }

  /**
   * After a member's access changed (role, overrides, disabled, removed, left): drop cached answers, bring their
   * open live connections in line, and — when they lost access — cancel the invites they sent, so someone who was
   * just removed can't leave a way back in (e.g. an invite to a second account of theirs).
   */
  private async afterAccessChanged(shopId: string, memberUserId: string): Promise<void> {
    this.access.forget(shopId, memberUserId);
    const membership = await this.memberships.find(shopId, memberUserId);
    const active = membership?.status === 'active';
    try {
      await this.connections.updateShopAccess(
        shopId,
        memberUserId,
        active ? effectivePermissions(membership.role, membership.permissions) : null,
      );
    } catch (err) {
      // Best effort: new connections are checked again on connect.
      this.logger.warn({ err, shopId, memberUserId }, 'Could not update live connections after an access change');
    }
    if (!active) {
      for (const open of await this.invites.listOpenForShop(shopId)) {
        if (open.invitedBy === memberUserId) await this.invites.update(open.id, { revokedAt: new Date() });
      }
    }
  }

  /** Room for one more member (someone already listed — e.g. a disabled member invited again — takes no new seat). */
  private async assertMemberCapacity(shopId: string, memberUserId?: string): Promise<void> {
    const others = (await this.memberships.listForShop(shopId)).filter((m) => m.memberUserId !== memberUserId);
    if (others.length >= MAX_MEMBERS) {
      throw new BadRequestException(`A shop can have up to ${MAX_MEMBERS} members.`);
    }
  }

  /** Superusers manage everyone except other superusers; only the owner makes or changes superusers. */
  private assertCanManage(me: ShopAccess, currentRole?: ShopRole, nextRole?: ShopRole): void {
    if (me.isOwner) return;
    if (currentRole === 'manager' || nextRole === 'manager') {
      throw new ForbiddenException('Only the shop owner can add or change superusers.');
    }
  }

  private async inviteView(invite: ShopInvite): Promise<ShopInviteView> {
    const inviter = await this.users.findById(invite.invitedBy);
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      permissions: effectivePermissions(invite.role, invite.permissions),
      status: invite.expiresAt.getTime() < Date.now() ? 'expired' : 'pending',
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      invitedByName: personName(inviter),
    };
  }

  /** Best effort: the link is also returned so the owner can share it on WhatsApp. */
  private async sendInviteEmail(
    invite: ShopInvite,
    inviteUrl: string,
    shop: User,
    actorUserId: string,
  ): Promise<boolean> {
    try {
      const inviter = await this.users.findById(actorUserId);
      const shopName = shop.businessName?.trim() || 'our shop';
      await this.email.sendEmail({
        to: invite.email,
        subject: `${personName(inviter)} invited you to ${shopName} on ByajBazaar`,
        body: this.templates.renderShopInvite({
          shopName,
          inviterName: personName(inviter),
          roleLabel: ROLE_LABELS[invite.role] ?? invite.role,
          email: invite.email,
          inviteUrl,
          expiresDays: INVITE_DAYS,
        }),
        isHtml: true,
      });
      return true;
    } catch (err) {
      this.logger.warn({ err, inviteId: invite.id }, 'Shop invite email could not be sent');
      return false;
    }
  }
}

export type { ShopMembership };
