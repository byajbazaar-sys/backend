/** Several shops per owner, inviting members, changing / removing them — with in-memory repositories. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import type { ShopInvite, ShopMembership } from '../../src/application/features/shops/domain';
import { ShopAccessService } from '../../src/application/features/shops/service/shop-access.service';
import { ShopsService } from '../../src/application/features/shops/service/shops.service';

interface Person {
  id: string;
  email: string;
  firstName?: string;
  businessName?: string;
  ownerUserId?: string | null;
}

function setup() {
  const users = new Map<string, Person>();
  const memberships: ShopMembership[] = [];
  const invites: ShopInvite[] = [];
  const wsUpdates: { shopId: string; actor: string; permissions: Record<string, string> | null }[] = [];

  const add = (email: string, extra: Partial<Person> = {}) => {
    const p = { id: randomUUID(), email, businessName: 'Shop', ...extra };
    users.set(p.id, p);
    return p;
  };

  const usersRepo = {
    findById: async (id: string) => users.get(id) ?? null,
    findByEmail: async (email: string) => [...users.values()].find((u) => u.email === email) ?? null,
    listByOwner: async (owner: string) => [...users.values()].filter((u) => u.ownerUserId === owner),
    findByCatalogSlug: async () => null,
    existsCatalogSlug: async () => false,
    create: async (data: Partial<Person>) => add(data.email!, data),
  };
  const membershipsRepo = {
    find: async (shopId: string, memberUserId: string) =>
      memberships.find((m) => m.shopId === shopId && m.memberUserId === memberUserId) ?? null,
    findById: async (id: string) => memberships.find((m) => m.id === id) ?? null,
    listForShop: async (shopId: string) => memberships.filter((m) => m.shopId === shopId),
    listForMember: async (id: string) => memberships.filter((m) => m.memberUserId === id),
    upsert: async (m: Omit<ShopMembership, 'id'>) => {
      const existing = memberships.find((x) => x.shopId === m.shopId && x.memberUserId === m.memberUserId);
      if (existing) return Object.assign(existing, m);
      const created = { ...m, id: randomUUID() };
      memberships.push(created);
      return created;
    },
    update: async (id: string, patch: Partial<ShopMembership>) =>
      Object.assign(memberships.find((m) => m.id === id)!, patch),
    delete: async (id: string) => {
      memberships.splice(
        memberships.findIndex((m) => m.id === id),
        1,
      );
    },
  };
  const invitesRepo = {
    create: async (i: Omit<ShopInvite, 'id'>) => {
      const created = { ...i, id: randomUUID(), createdAt: new Date() };
      invites.push(created);
      return created;
    },
    findById: async (id: string) => invites.find((i) => i.id === id) ?? null,
    findByTokenHash: async (h: string) => invites.find((i) => i.tokenHash === h) ?? null,
    listOpenForShop: async (shopId: string) =>
      invites.filter((i) => i.shopId === shopId && !i.acceptedAt && !i.revokedAt),
    update: async (id: string, patch: Partial<ShopInvite>) => Object.assign(invites.find((i) => i.id === id)!, patch),
  };
  const access = new ShopAccessService(membershipsRepo as never, usersRepo as never);
  const noop = () => undefined;
  const svc = new ShopsService(
    usersRepo as never,
    membershipsRepo as never,
    invitesRepo as never,
    { getUrlAsync: async () => null } as never,
    { sendEmail: async () => undefined } as never,
    { renderShopInvite: () => '' } as never,
    { buildShopInviteUrl: (token: string) => token } as never,
    access,
    {
      updateShopAccess: async (shopId: string, actor: string, permissions: Record<string, string> | null) => {
        wsUpdates.push({ shopId, actor, permissions });
      },
    } as never,
    { info: noop, warn: noop, error: noop } as never,
  );

  const owner = add('owner@x.com');
  /** Invite + accept; returns the member and their membership. */
  const join = async (email: string, role: 'manager' | 'staff' | 'viewer' | 'custom' = 'staff', by = owner.id) => {
    const person = (await usersRepo.findByEmail(email)) ?? add(email, { businessName: undefined });
    const { inviteUrl } = await svc.createInvite(by, owner.id, { email, role });
    await svc.acceptInvite(person.id, inviteUrl);
    return { person, membership: (await membershipsRepo.find(owner.id, person.id))! };
  };

  return { svc, access, users, memberships, invites, wsUpdates, owner, add, join };
}

describe('invites', () => {
  it('lets the invited email join with the invited role', async () => {
    const t = setup();
    const { person, membership } = await t.join('staff@x.com', 'staff');
    assert.equal(membership.role, 'staff');
    assert.equal((await t.access.accessFor(person.id, t.owner.id))?.role, 'staff');
    const shops = await t.svc.listShops(person.id);
    assert.deepEqual(
      shops.map((s) => s.kind),
      ['primary', 'member'],
    );
  });

  it('only accepts for the invited email, once, before it expires', async () => {
    const t = setup();
    const other = t.add('other@x.com');
    const { inviteUrl } = await t.svc.createInvite(t.owner.id, t.owner.id, { email: 'a@x.com', role: 'staff' });
    await assert.rejects(t.svc.acceptInvite(other.id, inviteUrl), /Sign in with that email/);
    const a = t.add('a@x.com');
    await t.svc.acceptInvite(a.id, inviteUrl);
    await t.svc.acceptInvite(a.id, inviteUrl); // same person again: fine (double tap)
    await assert.rejects(t.svc.acceptInvite(other.id, inviteUrl), /already been used/);

    const late = await t.svc.createInvite(t.owner.id, t.owner.id, { email: 'late@x.com', role: 'staff' });
    t.invites.at(-1)!.expiresAt = new Date(Date.now() - 1000);
    await assert.rejects(t.svc.acceptInvite(t.add('late@x.com').id, late.inviteUrl), /expired/);
  });

  it('replaces an older open invite for the same email', async () => {
    const t = setup();
    const first = await t.svc.createInvite(t.owner.id, t.owner.id, { email: 'a@x.com', role: 'staff' });
    await t.svc.createInvite(t.owner.id, t.owner.id, { email: 'A@x.com ', role: 'viewer' });
    await assert.rejects(t.svc.acceptInvite(t.add('a@x.com').id, first.inviteUrl), /not valid/);
    assert.equal((await t.svc.listInvites(t.owner.id, t.owner.id)).length, 1);
  });

  it('refuses the owner, existing members and extra-shop placeholder addresses', async () => {
    const t = setup();
    await assert.rejects(t.svc.createInvite(t.owner.id, t.owner.id, { email: 'owner@x.com', role: 'staff' }), /owner/);
    await t.join('m@x.com');
    await assert.rejects(t.svc.createInvite(t.owner.id, t.owner.id, { email: 'm@x.com', role: 'staff' }), /already/);
    await assert.rejects(
      t.svc.createInvite(t.owner.id, t.owner.id, { email: 'shop-1@shops.byajbazaar.invalid', role: 'staff' }),
      /valid email/,
    );
  });

  it('enforces the member limit when an invite is used, not only when it is sent', async () => {
    const t = setup();
    const open = await t.svc.createInvite(t.owner.id, t.owner.id, { email: 'last@x.com', role: 'staff' });
    for (let i = 0; i < 50; i++) {
      t.memberships.push({
        id: randomUUID(),
        shopId: t.owner.id,
        memberUserId: randomUUID(),
        role: 'staff',
        permissions: {},
        status: 'active',
      });
    }
    await assert.rejects(t.svc.acceptInvite(t.add('last@x.com').id, open.inviteUrl), /up to 50/);
  });

  it('lets a disabled member be invited back even at the limit (they keep their seat)', async () => {
    const t = setup();
    const { person, membership } = await t.join('back@x.com');
    await t.svc.updateMember(t.owner.id, t.owner.id, membership.id, { status: 'disabled' });
    for (let i = 0; i < 49; i++) {
      t.memberships.push({
        id: randomUUID(),
        shopId: t.owner.id,
        memberUserId: randomUUID(),
        role: 'staff',
        permissions: {},
        status: 'active',
      });
    }
    const { inviteUrl } = await t.svc.createInvite(t.owner.id, t.owner.id, { email: 'back@x.com', role: 'viewer' });
    await t.svc.acceptInvite(person.id, inviteUrl);
    assert.equal((await t.access.accessFor(person.id, t.owner.id))?.role, 'viewer');
  });

  it('lets only the owner invite, resend or cancel superuser invites', async () => {
    const t = setup();
    const { person: manager } = await t.join('mgr@x.com', 'manager');
    await assert.rejects(
      t.svc.createInvite(manager.id, t.owner.id, { email: 'm2@x.com', role: 'manager' }),
      /Only the shop owner/,
    );
    const { invite } = await t.svc.createInvite(t.owner.id, t.owner.id, { email: 'm3@x.com', role: 'manager' });
    await assert.rejects(t.svc.resendInvite(manager.id, t.owner.id, invite.id), /Only the shop owner/);
    await assert.rejects(t.svc.revokeInvite(manager.id, t.owner.id, invite.id), /Only the shop owner/);
    // Staff invites are fine for a superuser.
    await t.svc.createInvite(manager.id, t.owner.id, { email: 's@x.com', role: 'staff' });
  });

  it('refuses team management to members without team access', async () => {
    const t = setup();
    const { person } = await t.join('staff@x.com', 'staff');
    await assert.rejects(t.svc.listMembers(person.id, t.owner.id), /superuser/);
    await assert.rejects(t.svc.createInvite(person.id, t.owner.id, { email: 'z@x.com', role: 'staff' }), /superuser/);
  });
});

describe('changing and removing members', () => {
  it('drops old overrides when the role changes (a custom member made "Read only" can no longer edit)', async () => {
    const t = setup();
    const { person, membership } = await t.join('c@x.com', 'custom');
    await t.svc.updateMember(t.owner.id, t.owner.id, membership.id, {
      permissions: { customers: 'edit', loans: 'edit' },
    });
    await t.svc.updateMember(t.owner.id, t.owner.id, membership.id, { role: 'viewer' });
    const access = await t.access.accessFor(person.id, t.owner.id);
    assert.equal(access?.permissions.customers, 'view');
    assert.equal(access?.permissions.loans, 'view');
    // Explicit overrides sent with the new role are kept.
    await t.svc.updateMember(t.owner.id, t.owner.id, membership.id, {
      role: 'staff',
      permissions: { settings: 'view' },
    });
    assert.equal((await t.access.accessFor(person.id, t.owner.id))?.permissions.settings, 'view');
  });

  it('updates the member’s live connections with their new access', async () => {
    const t = setup();
    const { person, membership } = await t.join('c@x.com', 'staff');
    await t.svc.updateMember(t.owner.id, t.owner.id, membership.id, { role: 'viewer' });
    const last = t.wsUpdates.at(-1)!;
    assert.equal(last.actor, person.id);
    assert.equal(last.permissions?.customers, 'view');
  });

  it('cuts a disabled member off at once: access, live connections and the invites they sent', async () => {
    const t = setup();
    const { person: manager, membership } = await t.join('mgr@x.com', 'manager');
    await t.svc.createInvite(manager.id, t.owner.id, { email: 'sock@x.com', role: 'staff' });
    await t.access.accessFor(manager.id, t.owner.id); // cached
    await t.svc.updateMember(t.owner.id, t.owner.id, membership.id, { status: 'disabled' });
    assert.equal(await t.access.accessFor(manager.id, t.owner.id), null);
    assert.equal(t.wsUpdates.at(-1)?.permissions, null);
    assert.equal((await t.svc.listInvites(t.owner.id, t.owner.id)).length, 0);
    assert.deepEqual(
      (await t.svc.listShops(manager.id)).map((s) => s.kind),
      ['primary'],
    );
  });

  it('does the same when a member is removed or leaves', async () => {
    const t = setup();
    const { person: manager, membership } = await t.join('mgr@x.com', 'manager');
    await t.svc.createInvite(manager.id, t.owner.id, { email: 'sock@x.com', role: 'staff' });
    await t.svc.removeMember(manager.id, t.owner.id, membership.id); // leaves
    assert.equal(await t.access.accessFor(manager.id, t.owner.id), null);
    assert.equal(t.wsUpdates.at(-1)?.permissions, null);
    assert.equal((await t.svc.listInvites(t.owner.id, t.owner.id)).length, 0);
  });

  it('does not let members change their own access, or superusers manage other superusers', async () => {
    const t = setup();
    const { person: m1, membership: own } = await t.join('m1@x.com', 'manager');
    const { membership: m2 } = await t.join('m2@x.com', 'manager');
    const { membership: staff } = await t.join('s@x.com', 'staff');
    await assert.rejects(t.svc.updateMember(m1.id, t.owner.id, own.id, { role: 'staff' }), /your own access/);
    await assert.rejects(t.svc.updateMember(m1.id, t.owner.id, m2.id, { status: 'disabled' }), /Only the shop owner/);
    await assert.rejects(t.svc.removeMember(m1.id, t.owner.id, m2.id), /Only the shop owner/);
    await assert.rejects(t.svc.updateMember(m1.id, t.owner.id, staff.id, { role: 'manager' }), /Only the shop owner/);
    await t.svc.updateMember(m1.id, t.owner.id, staff.id, { role: 'viewer' });
  });

  it('refuses a membership id from another shop', async () => {
    const t = setup();
    const otherOwner = t.add('o2@x.com');
    const { membership } = await t.join('m@x.com');
    await assert.rejects(
      t.svc.updateMember(otherOwner.id, otherOwner.id, membership.id, { role: 'viewer' }),
      /not found/,
    );
    await assert.rejects(t.svc.removeMember(otherOwner.id, otherOwner.id, membership.id), /not found/);
  });

  it('leaves members whose account was deleted out of the team list', async () => {
    const t = setup();
    const { person } = await t.join('gone@x.com');
    t.users.delete(person.id);
    const list = await t.svc.listMembers(t.owner.id, t.owner.id);
    assert.deepEqual(
      list.map((m) => m.role),
      ['owner'],
    );
  });
});

describe('several shops per owner', () => {
  it('adds shops for the owner, not for extra shops or past the limit', async () => {
    const t = setup();
    const shop = await t.svc.createShop(t.owner.id, { businessName: 'Branch 2' });
    assert.equal(shop.kind, 'owned');
    assert.equal(t.users.get(shop.id)?.ownerUserId, t.owner.id);
    assert.match(t.users.get(shop.id)!.email, /@shops\.byajbazaar\.invalid$/);
    await assert.rejects(t.svc.createShop(shop.id, { businessName: 'x' }), /Only a shop owner/);
    for (let i = 0; i < 9; i++) await t.svc.createShop(t.owner.id, { businessName: `B${i}` });
    await assert.rejects(t.svc.createShop(t.owner.id, { businessName: 'too many' }), /up to 11/);
  });

  it('lets members of an extra shop see it, with the owner as owner', async () => {
    const t = setup();
    const shop = await t.svc.createShop(t.owner.id, { businessName: 'Branch 2' });
    const { inviteUrl } = await t.svc.createInvite(t.owner.id, shop.id, { email: 'b@x.com', role: 'staff' });
    const b = t.add('b@x.com', { businessName: undefined });
    const joined = await t.svc.acceptInvite(b.id, inviteUrl);
    assert.equal(joined.id, shop.id);
    const team = await t.svc.listMembers(t.owner.id, shop.id);
    assert.equal(team[0].userId, t.owner.id);
    assert.equal(team[0].isYou, true);
    await assert.rejects(t.svc.acceptInvite(t.owner.id, inviteUrl), /already been used/);
  });

  it('does not let the owner join their own shop through an invite', async () => {
    const t = setup();
    const shop = await t.svc.createShop(t.owner.id, { businessName: 'Branch 2' });
    // A manager of the extra shop invites the owner's email: refused at invite time.
    await assert.rejects(t.svc.createInvite(t.owner.id, shop.id, { email: 'owner@x.com', role: 'staff' }), /owner/);
  });
});
